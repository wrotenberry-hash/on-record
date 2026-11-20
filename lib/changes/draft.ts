/**
 * Drafting a menu of changes (owner, 20 Nov 2026): "AI drafts the menu; nothing goes live until the editor approves it".
 *
 * The model is never asked what could change. Code has already found each number, date, limit and difference and cut
 * its quote out of the bill (lib/changes/dials.ts, diff.ts). The model is asked one thing: put each of those into one
 * plain sentence per direction, or say it is not a real choice. What it writes then meets the checks in checks.ts,
 * which it cannot talk its way past. Pure: relative imports only; the call itself is made in run.ts.
 */
import type { DialCandidate, DialKind } from "./dials.ts";
import { DIRECTION_WORDS } from "./dials.ts";
import type { DiffCandidate } from "./diff.ts";
import { groupFailures, type GroupDraft } from "./checks.ts";
import type { OptionDirection, OptionSource } from "./types.ts";

export const MENU_INSTRUCTIONS = `You write the choices on a menu of possible changes to a bill. Residents who are not experts will tap the changes they want; their legislator's office may later see how many chose each. A wrong or slanted choice would misrepresent them, so follow every rule.

You never propose policy and you never decide what could change. You are given numbered items. Each item was cut, word for word, from one section of the bill: a number, a date, a time limit, a count, a rule about who is covered, or a passage that differs between two versions of the bill.

For each item, first decide whether it is a real choice about what the bill does. It is NOT a real choice, and you must set skip to true with a short reason, when the quoted words only name or point to something (a definition that only gives a name, the date printed on a map or report, the number of another law, a section number), when they are housekeeping (a short title, a technical or conforming change, a clerk's note), or when you cannot tell from the words what the figure does.

For a real choice write:
- about: what the quoted thing is, in plain everyday words, at most 12 words, with no figure and no opinion. Example: "the fine for a first offense".
- one sentence for each direction asked for.

Rules for every sentence:
1. One sentence, at most 22 words, ending in a full stop. Start with a verb (Raise, Lower, Keep, Remove, Give, Move, Cover).
2. Plain words an average reader knows. No legal terms, no "pursuant", no section numbers.
3. Offer a direction only. Never state a new figure. You may repeat the bill's own figure exactly as printed ("above $2,500"); you may not give any other.
4. State the change and nothing else: no reason, no effect, no "so that", no "to help".
5. Take no side: no "only", "just", "too", "fair", "strict", "weak", "generous", "should", and no word about whether a change is good.
6. For a number, date or limit, write four sentences:
   - up: the higher amount, the higher number, the later date, the longer time, or more people covered.
   - down: the lower amount, the lower number, the earlier date, the shorter time, or fewer people covered.
   - keep: begins "Keep" and says it stays as written.
   - remove: begins "Remove" and says what would be taken out of the bill.
7. For a passage that differs between two versions, write two sentences:
   - thisVersion: begins "Keep" and says, in plain words, what the newer version's wording does.
   - otherVersion: begins "Go back to" and says, in plain words, what the older version's wording did.
   Describe each version from its own quoted words only.
8. Leave a field empty ("") when it is not asked for on that item.

Return every item you were given, in order, each with its id.`;

const item = { type: "object", additionalProperties: false, required: ["id", "skip", "skipReason", "about", "up", "down", "keep", "remove", "thisVersion", "otherVersion"],
  properties: { id: { type: "string" }, skip: { type: "boolean" }, skipReason: { type: "string" }, about: { type: "string" }, up: { type: "string" }, down: { type: "string" },
    keep: { type: "string" }, remove: { type: "string" }, thisVersion: { type: "string" }, otherVersion: { type: "string" } } };
export const MENU_SCHEMA = { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: item } } };

export type MenuItemAnswer = { id: string; skip: boolean; skipReason: string; about: string; up: string; down: string; keep: string; remove: string; thisVersion: string; otherVersion: string };

const KIND_WORD: Record<DialKind, string> = { amount: "an amount of money", percent: "a percentage", count: "a number or quantity", age: "an age", duration: "a length of time", date: "a date or year", coverage: "a rule about who or what is covered" };

/** What the model is shown. `versions` names the two versions when differences are offered. `repair` lists what failed last time, per item. */
export function menuInput(bill: { label: string; title: string }, dials: readonly DialCandidate[], diffs: readonly DiffCandidate[],
  versions: { newer: string; older: string } | null, repair: Readonly<Record<string, string[]>> = {}): string {
  const out: string[] = [`BILL: ${bill.label}, ${bill.title}`, ""];
  for (const d of dials) {
    out.push(`ITEM ${d.id}: ${KIND_WORD[d.kind]} (write up, down, keep, remove; "up" means ${DIRECTION_WORDS[d.kind].up}, "down" means ${DIRECTION_WORDS[d.kind].down})`,
      `Section ${d.sectionNum}, ${d.heading}`, `The figure or words: ${d.value}`, `Quoted from the bill: ${d.quote}`, `The text around it, for understanding only: ${d.context}`);
    if (repair[d.id]?.length) out.push(`YOUR LAST ANSWER FOR THIS ITEM FAILED THESE CHECKS; fix each one: ${repair[d.id].join(" ")}`);
    out.push("");
  }
  for (const v of diffs) {
    out.push(`ITEM ${v.id}: a passage that differs between two versions (write thisVersion and otherVersion). The newer version is "${versions?.newer ?? "the newer version"}"; the older is "${versions?.older ?? "the older version"}".`,
      `Section ${v.sectionNum}, ${v.heading}`,
      `Newer version says: ${v.quote ?? "(nothing: the newer version leaves this out)"}`, `Older version says: ${v.otherQuote ?? "(nothing: the newer version added this)"}`);
    if (repair[v.id]?.length) out.push(`YOUR LAST ANSWER FOR THIS ITEM FAILED THESE CHECKS; fix each one: ${repair[v.id].join(" ")}`);
    out.push("");
  }
  return out.join("\n");
}

export type DraftedGroup = GroupDraft & { id: string; source: OptionSource; sourceRef: string; sectionNum: string; heading: string; otherSectionNum?: string | null };
export type Assembled = { passed: DraftedGroup[]; failed: Array<{ id: string; failures: string[] }>; skipped: Array<{ id: string; reason: string }>; missing: string[] };

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/**
 * Turns the model's answers into groups and runs every check against the stored text. `bodyOf(sectionNum)` gives the
 * newer version's section; `otherBodyOf` the older version's. Only groups with no failure are returned as passed.
 */
export function assembleMenu(answers: readonly MenuItemAnswer[], dials: readonly DialCandidate[], diffs: readonly DiffCandidate[],
  bodyOf: (sectionNum: string) => string | null, otherBodyOf: (sectionNum: string) => string | null, versionRef = "newer>older"): Assembled {
  const by = new Map(answers.map(a => [clean(a?.id), a]));
  const res: Assembled = { passed: [], failed: [], skipped: [], missing: [] };
  const opt = (direction: OptionDirection, wording: string) => ({ direction, wording: clean(wording) });
  for (const d of dials) {
    const a = by.get(d.id);
    if (!a) { res.missing.push(d.id); continue; }
    if (a.skip) { res.skipped.push({ id: d.id, reason: clean(a.skipReason) || "not a real choice" }); continue; }
    const g: DraftedGroup = { id: d.id, source: "dial", sourceRef: d.kind, kind: d.kind, about: clean(a.about), quote: d.quote, value: d.value, sectionNum: d.sectionNum, heading: d.heading,
      options: [opt("up", a.up), opt("down", a.down), opt("keep", a.keep), opt("remove", a.remove)] };
    const body = bodyOf(d.sectionNum), failures = body === null ? ["The section cited is not stored."] : groupFailures(g, body);
    if (failures.length) res.failed.push({ id: d.id, failures }); else res.passed.push(g);
  }
  for (const v of diffs) {
    const a = by.get(v.id);
    if (!a) { res.missing.push(v.id); continue; }
    if (a.skip) { res.skipped.push({ id: v.id, reason: clean(a.skipReason) || "not a real choice" }); continue; }
    const g: DraftedGroup = { id: v.id, source: "version", sourceRef: versionRef, kind: "difference", about: clean(a.about), quote: v.quote ?? "", otherQuote: v.otherQuote, sectionNum: v.sectionNum, heading: v.heading,
      otherSectionNum: v.otherSectionNum, options: [opt("this_version", a.thisVersion), opt("other_version", a.otherVersion)] };
    const body = v.quote ? bodyOf(v.sectionNum) : "", other = v.otherQuote && v.otherSectionNum ? otherBodyOf(v.otherSectionNum) : null;
    const failures = body === null ? ["The section cited is not stored."] : groupFailures(g, body ?? "", other);
    if (failures.length) res.failed.push({ id: v.id, failures }); else res.passed.push(g);
  }
  return res;
}

/** Reads the model's JSON. Anything that is not the asked-for shape gives an empty list (and so an empty menu), never a throw. */
export function parseMenuAnswer(text: string): MenuItemAnswer[] {
  try {
    const j = JSON.parse(text) as { items?: unknown };
    return Array.isArray(j?.items) ? (j.items as MenuItemAnswer[]).filter(x => x && typeof x === "object" && typeof (x as MenuItemAnswer).id === "string") : [];
  } catch { return []; }
}
