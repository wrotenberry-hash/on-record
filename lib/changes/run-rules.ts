/**
 * The rules a drafting run keeps to, and the plain notes an editor reads on a menu (owner, 20 Nov 2026: "$5 a month
 * for menus", "get approval before any bulk run", "say plainly where data is missing"). Pure: no imports.
 */
export type MenuRunLimits = { spendCapUsd: number; perRun: number; maxMenus: number };

/** The ledger purposes that count against the menus' own monthly limit: drafting and the reader test. */
export const CHANGE_SPEND_PURPOSES = ["change_menu", "change_reader"] as const;

/** Whether a run may start, and for how many bills. The worst case for one menu is set aside before it starts. */
export const MENU_WORST_CASE_USD = 0.4;
export function planMenuRun(s: { paused: boolean; keyConfigured: boolean; spentUsd: number; menus: number }, l: MenuRunLimits): { go: boolean; room: number; reason?: string } {
  if (s.paused) return { go: false, room: 0, reason: "drafting is paused (CHANGES_PAUSED)" };
  if (!s.keyConfigured) return { go: false, room: 0, reason: "no model key is configured" };
  if (s.menus >= l.maxMenus) return { go: false, room: 0, reason: `the limit of ${l.maxMenus} menus is reached; a larger run needs the owner's yes` };
  const afford = Math.floor((l.spendCapUsd - s.spentUsd) / MENU_WORST_CASE_USD);
  if (afford < 1) return { go: false, room: 0, reason: `the month's limit for menus ($${l.spendCapUsd}) is reached or too close ($${s.spentUsd.toFixed(2)} spent)` };
  return { go: true, room: Math.max(0, Math.min(l.perRun, l.maxMenus - s.menus, afford)) };
}

/**
 * What an editor is told about a menu beyond its choices: what could not be offered and why. Nothing is papered over:
 * a source with nothing to offer says so, and every item left out is counted with its reason.
 */
export function menuNotes(m: { dials: number; diffs: number; versions: number; pendingAmendments: number; skipped: ReadonlyArray<{ id: string; reason: string }>;
  failed: ReadonlyArray<{ id: string; failures: string[] }>; readerFailed: ReadonlyArray<{ id: string; failures: string[] }>; textNotes: readonly string[] }): string[] {
  const out: string[] = [];
  out.push(m.dials ? `From the bill's own text: ${m.dials} number${m.dials === 1 ? "" : "s"}, date${m.dials === 1 ? "" : "s"} or limit${m.dials === 1 ? "" : "s"} found.` : "From the bill's own text: no number, date or limit was found.");
  out.push(m.versions < 2 ? "Differences between versions: only one version of this bill has been published (or every published version says the same thing), so there is nothing to compare."
    : m.diffs ? `Differences between versions: ${m.diffs} passage${m.diffs === 1 ? "" : "s"} differ between the newest version and the last one that says something different.` : "Differences between versions: the newest version and the one before it say the same thing.");
  out.push(m.pendingAmendments ? `Filed amendments: ${m.pendingAmendments} ${m.pendingAmendments === 1 ? "is" : "are"} on the official list. Their text is not read yet, so none is offered.`
    : "Filed amendments: none is on the official list for this bill. Amendments offered in committee are not published in a form that can be read.");
  if (m.skipped.length) out.push(`Left out as not a real choice (${m.skipped.length}): ${m.skipped.map(s => s.reason).filter(Boolean).slice(0, 6).join("; ")}.`);
  if (m.failed.length) out.push(`Left out after failing a written check twice (${m.failed.length}): ${m.failed.map(f => f.failures[0]).slice(0, 4).join(" ")}`);
  if (m.readerFailed.length) out.push(`Left out after the reader test (${m.readerFailed.length}): ${m.readerFailed.map(f => f.failures[0]).slice(0, 4).join(" ")}`);
  out.push(...m.textNotes);
  return out;
}
