/**
 * Procedural votes in a list of votes (owner, 20 Nov 2026): "On every vote list, collapse resolutions that only set
 * debate rules into one line: 'Procedural votes (N)', expandable. Give them a single standard explanation written once
 * and approved by me … No per-bill AI call."
 *
 * A "debate rule" is a House resolution whose whole job is to set the terms for debating other measures ("Providing for
 * consideration of the bill (H.R. 2102) …"). A vote on it, or on a step toward it (ordering the previous question on
 * it, discharging it), says nothing about the bill it names. In a list these votes are taken out of the run of rows
 * and shown as one closed line with the count; opened, it lists them plainly. Nothing is written about any one of them:
 * there is one explanation for all, kept here. Pure (no imports), so node's test runner loads it: tests/procedural.test.mjs.
 */

/** The one explanation, in the owner's words (20 Nov 2026). Change it here and it changes everywhere. */
export const PROCEDURAL_EXPLANATION = "A vote on the rules for debating another bill, not on the bill itself.";
export const proceduralLabel = (n: number) => `Procedural votes (${n})`;

// The titles House debate rules carry. A special rule "provides for consideration" of one or more measures; a few
// "relate to consideration" of a Senate amendment or waive the wait before a rule may be taken up.
const RULE_TITLE = /^(?:providing for|relating to) (?:the )?(?:further )?consideration of\b|^waiving a requirement of clause 6\(a\) of rule XIII\b/i;

/**
 * Whether a vote is on a resolution that only sets debate rules. Needs both: the measure is a simple House resolution
 * (its id or type says "hres"), and its title is a rule's title. `title` is the measure's own title when on file,
 * else the roll call's.
 */
export function isDebateRule(v: { billId?: string | null; billType?: string | null; title?: string | null }): boolean {
  const type = (v.billType ?? String(v.billId ?? "").match(/^\d+-([a-z]+)-\d+$/)?.[1] ?? "").toLowerCase();
  return type === "hres" && RULE_TITLE.test(String(v.title ?? "").replace(/\s+/g, " ").trim());
}

/** A list in its own order, with the debate-rule votes taken out into their own group (also in order). */
export function splitProcedural<T>(rows: readonly T[], isRule: (row: T) => boolean): { main: T[]; procedural: T[] } {
  const main: T[] = [], procedural: T[] = [];
  for (const r of rows) (isRule(r) ? procedural : main).push(r);
  return { main, procedural };
}

/**
 * The first `n` ordinary rows of a newest-first list, and the debate-rule votes that fall among them (those met before
 * the n-th ordinary row). So "the ten latest votes" is ten votes a reader can open, plus one line for what was skipped.
 */
export function takeWithProcedural<T>(rows: readonly T[], n: number, isRule: (row: T) => boolean): { main: T[]; procedural: T[] } {
  const main: T[] = [], procedural: T[] = [];
  for (const r of rows) {
    if (isRule(r)) { if (main.length < n) procedural.push(r); continue; }
    if (main.length >= n) break;
    main.push(r);
  }
  return { main, procedural };
}

/** How a member voted, in two or three words; the group's one explanation says what kind of vote it was. */
export function shortPosition(position: string): string {
  const p = position.trim().toLowerCase();
  if (p === "yea" || p === "yes" || p === "aye") return "Voted Yes";
  if (p === "nay" || p === "no") return "Voted No";
  if (p === "present") return "Voted Present";
  if (p === "not voting" || p === "absent" || p === "excused") return "Did not vote";
  return `Recorded as “${position}”`;
}
