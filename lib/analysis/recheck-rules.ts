import { currentShape } from "./prompt-order.ts";

/**
 * The weekly re-check's mistake of November 2026, and what the site says about it.
 *
 * Until 19 Nov 2026 the re-check compared generator versions as text, so a summary from generator 10 or later was
 * judged by the rules for the oldest format and taken off the page for breaking them. Those takedowns are recorded
 * with the rule they "broke". The public corrections log must not repeat that as if the summary were at fault: for
 * these rows it says the check was wrong. Nothing stored is changed here; a summary taken down this way stays down
 * until it has been read against its sources and an editor puts it back.
 */
export const RECHECK_FIXED_AT = Date.UTC(2026, 10, 20, 0, 0, 0); // the fix went live late on 19 Nov; the next weekly sample is after this

/**
 * True when a re-check row was produced by the wrong rules: made before the fix, for a summary in the current format
 * whose version sorted below "b5" as text (generator 10 and later; 5 to 9 happened to sort correctly).
 */
export function judgedByWrongRules(at: number, promptVersion: string | null | undefined): boolean {
  return at < RECHECK_FIXED_AT && currentShape(promptVersion) && !(String(promptVersion).trim() >= "b5");
}

export const RECHECK_MISTAKE = "Our mistake: an automatic check applied rules written for an older format and took this summary down on that basis. The check was fixed on November 19, 2026. The summary is read against its sources before it is shown again.";
