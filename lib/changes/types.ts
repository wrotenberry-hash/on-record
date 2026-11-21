/**
 * Suggest changes (owner, 20 Nov 2026; docs/SUGGEST_CHANGES.md): the shapes the parts of the feature share.
 * Pure: types and a few constants, no imports. Federal bills first; every shape carries `system` so Texas fits without rework.
 */
export type BillSystem = "federal" | "texas";

/** One section of one version of a bill, as stored in bill_text_sections. `body` is the section as published. */
export type StoredSection = {
  billKey: string; system: BillSystem; version: string; versionLabel: string; versionDate: string | null;
  seq: number; num: string; heading: string; body: string; sourceUrl: string;
};

/** A version of a bill whose text is stored. Newest first wherever a list of these is returned. */
export type StoredVersion = { version: string; label: string; date: string | null; sourceUrl: string; sections: number; chars: number };

/** Where a bill is, in the seven places the owner named, plus "resolving" (the two chambers settling differences). */
export type WindowPlace = "introduced" | "committee" | "hearing_scheduled" | "out_of_committee" | "floor" | "other_chamber" | "resolving" | "final";
/**
 * Whether the bill can still be changed. "narrow": only in a limited way (settling differences between the chambers).
 * "not_open_yet": filed, but nobody who could change it has it yet (a Texas bill filed before the session opens).
 */
export type WindowState = "open" | "narrow" | "closed" | "not_open_yet";

/**
 * What a bill page says about the window. Every sentence is plain English and promises nothing: "can still be changed"
 * is a fact about procedure, never a forecast. `hearing` always says something, and when no date has been confirmed
 * against the chamber's own calendar it says the date isn't known (owner's condition, 20 Nov 2026).
 */
export type BillWindow = {
  place: WindowPlace; state: WindowState;
  /** "In committee: the House Committee on Natural Resources has it." */
  where: string;
  /** "It can still be changed: committees rewrite bills before sending them on." / "The window is closed: ..." */
  changes: string;
  /** "A hearing is set for Thursday, November 19 at 12:30 p.m. Eastern." / "No hearing date is known." */
  hearing: string;
  /** When a confirmed hearing or markup is ahead: its start (ISO, UTC), else null. */
  hearingAt: string | null;
  sources: Array<{ label: string; url: string }>;
  /** While the bill is in committee: the chamber whose committee has it ("House", "Senate"). For the one-line status (lib/changes/stands-line.ts). */
  chamber?: string;
  /**
   * Set when the bill is settled (20 Nov 2026): "law" when it became law; "not_law" when it failed, was vetoed, or its
   * Congress or session ended without it becoming law. Absent while anything is still pending, including a bill that
   * is on the President's or the Governor's desk. Bill pages use it to choose the reader's question (lib/constituent/settled.ts).
   */
  settled?: "law" | "not_law";
};

/** The three sources a menu option may come from, and nothing else (owner, 20 Nov 2026). */
export type OptionSource = "amendment" | "version" | "dial";
export const SOURCE_LABEL: Record<OptionSource, string> = {
  amendment: "An amendment filed on the official record",
  version: "A difference between two versions of this bill",
  dial: "A number, date or limit in the bill's own text",
};

/** up/down are "higher/lower" for an amount, "later/earlier" for a date, "more/fewer people" for who is covered. */
export type OptionDirection = "up" | "down" | "keep" | "remove" | "adopt" | "reject" | "this_version" | "other_version";

/** The generator's name for menus, bumped when the drafting prompt or the candidate rules change. */
export const MENU_GENERATOR = "m1-2026-11-20";
