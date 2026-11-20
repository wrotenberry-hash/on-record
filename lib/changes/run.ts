import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { changeMenus, changeOptions, officialAmendments, officialBills } from "@/db/schema";
import { responseRequest, outputText } from "@/lib/automated-research";
import { callCost, maxCallCost, priceTable } from "@/lib/model-cost";
import { spendSince } from "@/lib/model-calls";
import { analysisLimits } from "@/lib/analysis/generate";
import { getCursor, setCursor } from "@/lib/federal/ingest";
import { billLabel } from "@/components/federal/badges";
import { ensureBillText, sectionsOf } from "@/lib/changes/text-store";
import { openWindowBills, billWindow } from "@/lib/changes/window-store";
import { findDials, squash } from "@/lib/changes/dials";
import { findDifferences } from "@/lib/changes/diff";
import { assembleMenu, menuInput, parseMenuAnswer, MENU_INSTRUCTIONS, MENU_SCHEMA, type DraftedGroup, type MenuItemAnswer } from "@/lib/changes/draft";
import { CHOICE_READER_INSTRUCTIONS, CHOICE_READER_SCHEMA, parseReaderAnswer, readerFailures, readerInput, type ReaderAnswer } from "@/lib/changes/reader";
import { planMenuRun, menuNotes, CHANGE_SPEND_PURPOSES, type MenuRunLimits } from "@/lib/changes/run-rules";
import { MENU_GENERATOR, SOURCE_LABEL } from "@/lib/changes/types";

/**
 * Drafting menus of changes (owner, 20 Nov 2026: "$5 a month for menus", "no bulk run without approval").
 *
 * One bill at a time, a few a run, only bills whose window is open, and only inside its own monthly limit
 * (`CHANGES_SPEND_CAP_USD`, default $5) counted apart from summaries. Nothing drafted here is shown to a reader: a
 * menu is stored as "review" and waits in the editor's queue. `CHANGES_PAUSED=1` stops drafting without a deploy.
 */
const num = (v: string | undefined, d: number) => { const n = Number(v); return v?.trim() && Number.isFinite(n) && n >= 0 ? n : d; };
export function changeLimits(env: Record<string, string | undefined> = process.env): MenuRunLimits & { model: string; readerModel: string; paused: boolean } {
  const a = analysisLimits();
  return { spendCapUsd: num(env.CHANGES_SPEND_CAP_USD, 5), perRun: num(env.CHANGES_MENUS_PER_RUN, 5), maxMenus: num(env.CHANGES_MAX_MENUS, 15),
    model: env.CHANGES_WRITER_MODEL?.trim() || a.writerModel, readerModel: env.CHANGES_READER_MODEL?.trim() || a.model, paused: env.CHANGES_PAUSED === "1" };
}

const monthStart = (now: number) => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
export async function changeSpendSince(since: number): Promise<number> {
  let total = 0; for (const p of CHANGE_SPEND_PURPOSES) total += await spendSince(since, p);
  return total;
}

type Ask = (model: string, name: string, instructions: string, input: string, schema: unknown, purpose: (typeof CHANGE_SPEND_PURPOSES)[number], refId: string, maxOutputTokens: number) => Promise<{ text: string; costUsd: number }>;
const askModel: Ask = async (model, name, instructions, input, schema, purpose, refId, maxOutputTokens) => {
  const key = process.env.OPENAI_API_KEY?.trim() || "";
  if (!key) throw Error("no model key");
  const response = await responseRequest(key, model, { instructions, input, max_output_tokens: maxOutputTokens, timeoutMs: 100_000, text: { format: { type: "json_schema", name, strict: true, schema } } }, { purpose, refId });
  return { text: outputText(response).map(x => x.text ?? "").join(""), costUsd: callCost(model, response.usage, 0, priceTable(process.env.OPENAI_PRICES_JSON)).usd };
};

export type MenuOutcome = { billKey: string; label: string; status: "review" | "closed" | "failed" | "skipped"; groups: number; options: number; costUsd: number; notes: string[] };

/** Drafts the menu for one federal bill and stores it. Returns what happened; never throws. */
export async function draftMenuFor(billKey: string, limits = changeLimits(), o: { ask?: Ask; now?: number; spent?: () => number } = {}): Promise<MenuOutcome> {
  const db = getDb(), now = o.now ?? Date.now(), ask = o.ask ?? askModel;
  const bill = await db.select({ id: officialBills.id, billType: officialBills.billType, number: officialBills.number, title: officialBills.title }).from(officialBills).where(eq(officialBills.id, billKey)).get();
  const label = bill ? billLabel(bill.billType, bill.number) : billKey;
  const out = (status: MenuOutcome["status"], notes: string[], groups = 0, options = 0, costUsd = 0): MenuOutcome => ({ billKey, label, status, groups, options, costUsd, notes });
  if (!bill) return out("skipped", ["The bill is not on file."]);
  let cost = 0;
  try {
    const text = await ensureBillText(billKey, { now, maxVersions: 4 });
    const newest = text.versions[0];
    if (!newest) return out("skipped", ["The bill's text could not be read, so no menu was drafted.", ...text.notes]);
    const already = await db.select({ id: changeMenus.id }).from(changeMenus).where(and(eq(changeMenus.billKey, billKey), eq(changeMenus.version, newest.version))).get();
    if (already) return out("skipped", ["A menu for this version already exists."]);
    const sections = await sectionsOf(billKey, newest.version);
    // The version to compare with is the newest one that says something different. A bill sent to the other chamber is
    // printed again word for word ("Referred in Senate" after "Engrossed in House"); comparing those two shows nothing.
    const same = (a: typeof sections, b: typeof sections) => a.length === b.length && a.every((x, i) => squash(x.body) === squash(b[i].body) && x.num === b[i].num);
    let olderVersion: (typeof text.versions)[number] | null = null, older: typeof sections = [];
    for (const v of text.versions.slice(1)) {
      const secs = await sectionsOf(billKey, v.version);
      if (secs.length && !same(secs, sections)) { olderVersion = v; older = secs; break; }
    }
    const dials = findDials(sections), diffs = older.length ? findDifferences(older, sections) : [];
    const pending = (await db.select({ n: sql<number>`count(*)` }).from(officialAmendments).where(and(eq(officialAmendments.billId, billKey), eq(officialAmendments.outcome, "pending"))).get())?.n ?? 0;
    const window = await billWindow(billKey, now).catch(() => null);
    const menuId = crypto.randomUUID();
    const store = async (status: "review" | "closed" | "failed", notes: string[], groups: DraftedGroup[], reader: Map<string, ReaderAnswer[]>) => {
      await db.insert(changeMenus).values({ id: menuId, billKey, system: "federal", version: newest.version, status, generator: MENU_GENERATOR, model: limits.model, costUsd: Math.round(cost * 1e5) / 1e5,
        notes, windowAtDraft: window ? `${window.where} ${window.changes}` : null, createdAt: now });
      let seq = 0;
      for (const g of groups) for (const op of g.options) {
        const said = reader.get(g.id)?.find(a => a.id.endsWith(`.${op.direction}`))?.restated;
        await db.insert(changeOptions).values({ id: crypto.randomUUID(), menuId, billKey, seq: seq++, source: g.source, sourceRef: g.sourceRef, sourceLabel: SOURCE_LABEL[g.source],
          sectionVersion: newest.version, sectionNum: g.sectionNum, quote: g.quote, otherQuote: g.otherQuote ?? null, groupKey: g.id, kind: g.kind, about: g.about, direction: op.direction, wording: op.wording,
          checks: { passed: true, failures: [], ...(said ? { reader: said.slice(0, 200) } : {}) }, status: "draft", createdAt: now });
      }
    };
    if (!dials.length && !diffs.length) {
      const notes = menuNotes({ dials: 0, diffs: 0, versions: olderVersion ? 2 : 1, pendingAmendments: pending, skipped: [], failed: [], readerFailed: [], textNotes: text.notes });
      await store("closed", notes, [], new Map());
      return out("closed", notes);
    }

    const versions = olderVersion ? { newer: newest.label, older: olderVersion.label } : null;
    const bodyOf = (n: string) => sections.find(s => s.num === n)?.body ?? null, otherBodyOf = (n: string) => older.find(s => s.num === n)?.body ?? null;
    const versionRef = olderVersion ? `${olderVersion.version}>${newest.version}` : newest.version;
    const round = async (repair: Record<string, string[]>, only?: Set<string>) => {
      const d = only ? dials.filter(x => only.has(x.id)) : dials, v = only ? diffs.filter(x => only.has(x.id)) : diffs;
      const input = menuInput({ label, title: bill.title }, d, v, versions, repair);
      // Never start a call that could take the month past the limit.
      if ((o.spent?.() ?? 0) + cost + maxCallCost(limits.model, MENU_INSTRUCTIONS.length + input.length, 3500) > limits.spendCapUsd) throw Error("spend limit");
      const r = await ask(limits.model, "menu_of_changes", MENU_INSTRUCTIONS, input, MENU_SCHEMA, "change_menu", menuId, 3500);
      cost += r.costUsd;
      return { answers: parseMenuAnswer(r.text) as MenuItemAnswer[], d, v };
    };
    const first = await round({});
    let res = assembleMenu(first.answers, first.d, first.v, bodyOf, otherBodyOf, versionRef);
    // One more try for the items that failed a check, with the failures spelled out. Then they are left out.
    if (res.failed.length) {
      const again = await round(Object.fromEntries(res.failed.map(f => [f.id, f.failures])), new Set(res.failed.map(f => f.id))).catch(() => null);
      if (again) {
        const second = assembleMenu(again.answers, again.d, again.v, bodyOf, otherBodyOf, versionRef);
        res = { passed: [...res.passed, ...second.passed], failed: second.failed, skipped: [...res.skipped, ...second.skipped], missing: [...res.missing, ...second.missing] };
      }
    }
    // The average-reader test: one call, the sentences only.
    let passed = res.passed, readerFailed: Array<{ id: string; failures: string[] }> = [];
    const readerSaid = new Map<string, ReaderAnswer[]>();
    if (passed.length) {
      const input = readerInput(passed);
      if ((o.spent?.() ?? 0) + cost + maxCallCost(limits.readerModel, CHOICE_READER_INSTRUCTIONS.length + input.length, 2500) > limits.spendCapUsd) throw Error("spend limit");
      const r = await ask(limits.readerModel, "choice_reader", CHOICE_READER_INSTRUCTIONS, input, CHOICE_READER_SCHEMA, "change_reader", menuId, 2500);
      cost += r.costUsd;
      const answers = parseReaderAnswer(r.text), fails = readerFailures(passed, answers);
      for (const g of passed) readerSaid.set(g.id, answers.filter(a => a.id.startsWith(`${g.id}.`)));
      readerFailed = passed.filter(g => (fails.get(g.id) ?? []).length).map(g => ({ id: g.id, failures: fails.get(g.id)! }));
      passed = passed.filter(g => !(fails.get(g.id) ?? []).length);
    }
    // Reading order: as the items appear in the bill.
    const order = new Map([...dials.map(d => d.id), ...diffs.map(d => d.id)].map((id, i) => [id, i]));
    passed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const notes = menuNotes({ dials: dials.length, diffs: diffs.length, versions: olderVersion ? 2 : 1, pendingAmendments: pending, skipped: res.skipped, failed: [...res.failed, ...res.missing.map(id => ({ id, failures: ["The writer gave no answer for this item."] }))],
      readerFailed, textNotes: text.notes });
    await store(passed.length ? "review" : "closed", notes, passed, readerSaid);
    return out(passed.length ? "review" : "closed", notes, passed.length, passed.reduce((n, g) => n + g.options.length, 0), cost);
  } catch (e) {
    const why = e instanceof Error ? e.message : "failed";
    return out(why === "spend limit" ? "skipped" : "failed", [why === "spend limit" ? "Stopped before a call that could pass the monthly limit for menus." : `Drafting stopped on an error: ${why.slice(0, 160)}`], 0, 0, cost);
  }
}

export type MenuRun = { status: "COMPLETE" | "SKIPPED" | "FAILED"; reason?: string; spentUsd: number; capUsd: number; made: MenuOutcome[] };

const NO_TEXT_WAIT_MS = 20 * 3600_000, MAX_LOOKED_AT = 30;

/** One run: a few bills whose window is open and that have no menu yet. Logs one line per bill. */
export async function runChangeMenus(o: { budgetMs?: number; now?: number; ask?: Ask } = {}): Promise<MenuRun> {
  const db = getDb(), now = o.now ?? Date.now(), limits = changeLimits(), deadline = Date.now() + (o.budgetMs ?? 240_000);
  let spent = await changeSpendSince(monthStart(now));
  const have = (await db.select({ n: sql<number>`count(*)` }).from(changeMenus).get())?.n ?? 0;
  const plan = planMenuRun({ paused: limits.paused, keyConfigured: !!process.env.OPENAI_API_KEY?.trim() || !!o.ask, spentUsd: spent, menus: have }, limits);
  const made: MenuOutcome[] = [];
  const finish = async (status: MenuRun["status"], reason?: string): Promise<MenuRun> => {
    const run = { status, reason, spentUsd: Math.round(spent * 1e4) / 1e4, capUsd: limits.spendCapUsd, made };
    await setCursor(db, "changes:lastRun", JSON.stringify({ at: now, status, reason: reason ?? null, spentUsd: run.spentUsd, made: made.map(m => ({ bill: m.label, status: m.status, groups: m.groups, options: m.options, costUsd: m.costUsd })) })).catch(() => undefined);
    return run;
  };
  if (!plan.go) return finish("SKIPPED", plan.reason);
  const open = await openWindowBills(40);
  const keys = open.filter(b => b.system === "federal").map(b => b.billKey);
  const done = keys.length ? new Set((await db.select({ k: changeMenus.billKey }).from(changeMenus).where(inArray(changeMenus.billKey, keys))).map(r => r.k)) : new Set<string>();
  // A bill whose text could not be read is tried again next run, at most three times.
  const tries = JSON.parse((await getCursor(db, "changes:tries")) || "{}") as Record<string, number>;
  // 20 Nov 2026, first real run: the five newest bills in committee were taken, and four of them had no published text
  // yet, so one menu was drafted. A bill with no published text costs nothing to pass over: it does not use up one of
  // the run's places, and it is looked at again a day later, when its text may be out.
  const noText = JSON.parse((await getCursor(db, "changes:noText")) || "{}") as Record<string, number>;
  const todo = keys.filter(k => !done.has(k) && (tries[k] ?? 0) < 3 && !(noText[k] && now - noText[k] < NO_TEXT_WAIT_MS) && /-(?:hr|s|hjres|sjres)-/.test(k));
  if (!todo.length) return finish("SKIPPED", "no bill with an open window is waiting for a menu");
  let drafted = 0, looked = 0;
  for (const billKey of todo) {
    if (drafted >= plan.room || looked >= MAX_LOOKED_AT || Date.now() > deadline - 60_000) break;
    looked++;
    const m = await draftMenuFor(billKey, limits, { ask: o.ask, now, spent: () => spent });
    spent += m.costUsd; made.push(m);
    if (m.status === "skipped" && m.costUsd === 0 && m.notes.some(n => /text could not be read/.test(n))) noText[billKey] = now;
    else { drafted++; if (m.status === "skipped" || m.status === "failed") tries[billKey] = (tries[billKey] ?? 0) + 1; }
    console.log(`CHANGE_MENU | ${m.label} | ${m.status} | ${m.groups} groups, ${m.options} choices | $${m.costUsd.toFixed(4)} | ${m.notes.join(" ").slice(0, 400)}`);
    if (m.notes.some(n => /monthly limit for menus/.test(n))) break;
  }
  await setCursor(db, "changes:tries", JSON.stringify(tries)).catch(() => undefined);
  await setCursor(db, "changes:noText", JSON.stringify(Object.fromEntries(Object.entries(noText).filter(([, at]) => now - at < 7 * 24 * 3600_000)))).catch(() => undefined);
  return finish("COMPLETE");
}

/** For the health probe: counts, the month's spend against the limit, and the last run. No wording is returned. */
export async function changeCounts(now = Date.now()) {
  const db = getDb(), limits = changeLimits();
  const menus = await db.select({ status: changeMenus.status, n: sql<number>`count(*)` }).from(changeMenus).groupBy(changeMenus.status);
  const options = await db.select({ status: changeOptions.status, source: changeOptions.source, n: sql<number>`count(*)` }).from(changeOptions).groupBy(changeOptions.status, changeOptions.source);
  const last = await getCursor(db, "changes:lastRun");
  return { menus: Object.fromEntries(menus.map(m => [m.status, Number(m.n)])), options: options.map(x => ({ status: x.status, source: x.source, n: Number(x.n) })),
    spendMonthUsd: Math.round(await changeSpendSince(monthStart(now)) * 1e4) / 1e4, limits: { spendCapUsd: limits.spendCapUsd, perRun: limits.perRun, maxMenus: limits.maxMenus, paused: limits.paused, generator: MENU_GENERATOR },
    lastRun: last ? JSON.parse(last) as unknown : null };
}
