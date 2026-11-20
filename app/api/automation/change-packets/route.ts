import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { changeMenus, changeOptions, billTextSections } from "@/db/schema";
import { getCursor, setCursor } from "@/lib/federal/ingest";

/**
 * Writes drafted menus of changes to the function's own log, each choice beside the section it quotes, so every
 * choice can be read against the official text before the phase is called done (owner, 20 Nov 2026: "verify every
 * menu option against the source text and report the error rate").
 *
 * It answers with counts and bill ids only; the drafts go to the log, which only the owner's host account can read.
 * It makes no model call and changes nothing. Like the health probe it needs no sign-in, so it is paced: one run
 * every 10 minutes, at most 5 menus a run (?skip=5 reads the next five).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EVERY_MS = 10 * 60 * 1000, PER_RUN = 5, CURSOR = "changes:relog";

export async function GET(request: Request) {
  const db = getDb(), now = Date.now(), last = Number(await getCursor(db, CURSOR)) || 0;
  if (now - last < EVERY_MS) return Response.json({ service: "on-record", ran: false, nextAfter: new Date(last + EVERY_MS).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  await setCursor(db, CURSOR, String(now));
  const skip = Math.max(0, Math.min(100, Number(new URL(request.url).searchParams.get("skip")) || 0));
  const menus = await db.select().from(changeMenus).orderBy(desc(changeMenus.createdAt)).limit(PER_RUN).offset(skip);
  const options = menus.length ? await db.select().from(changeOptions).where(inArray(changeOptions.menuId, menus.map(m => m.id))).orderBy(changeOptions.menuId, changeOptions.seq) : [];
  let lines = 0;
  const log = (line: string) => { console.log(line.slice(0, 3800)); lines++; };
  for (const m of menus) {
    log(`MENU_PACKET ${m.billKey} | MENU | ${JSON.stringify({ id: m.id, version: m.version, status: m.status, generator: m.generator, model: m.model, costUsd: m.costUsd, window: m.windowAtDraft, notes: m.notes })}`);
    const mine = options.filter(o => o.menuId === m.id), cited = [...new Set(mine.map(o => o.sectionNum))];
    for (const o of mine) log(`MENU_PACKET ${m.billKey} | CHOICE ${o.groupKey}.${o.direction} | ${JSON.stringify({ source: o.source, sourceRef: o.sourceRef, kind: o.kind, section: o.sectionNum, about: o.about, wording: o.wording, quote: o.quote, otherQuote: o.otherQuote, reader: o.checks.reader ?? null, status: o.status })}`);
    for (const num of cited) {
      const s = await db.select().from(billTextSections).where(and(eq(billTextSections.billKey, m.billKey), eq(billTextSections.version, m.version), eq(billTextSections.num, num))).get();
      if (!s) { log(`MENU_PACKET ${m.billKey} | SECTION ${num} | not stored`); continue; }
      const parts = Math.max(1, Math.ceil(s.body.length / 3000));
      for (let k = 0; k < parts; k++) log(`MENU_PACKET ${m.billKey} | SECTION ${num} | part ${k + 1}/${parts} | ${k ? "" : `${s.heading} <${s.sourceUrl}> `}${s.body.slice(k * 3000, (k + 1) * 3000)}`);
    }
  }
  return Response.json({ service: "on-record", ran: true, menus: menus.map(m => ({ bill: m.billKey, version: m.version, status: m.status, choices: options.filter(o => o.menuId === m.id).length })), lines }, { headers: { "Cache-Control": "no-store" } });
}
