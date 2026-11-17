/**
 * Texas primers (owner instruction 5, 17 Nov 2026): "Texas primers: how the Legislature works, Lt. Governor and
 * Speaker roles, the session calendar, special sessions."
 *
 * Same kind of thing as the federal primers in lib/analysis/primers.ts and held to the same written rules
 * (tests/texas-primers.test.mjs). Every sentence was written from a research note that quotes the official words it
 * rests on (kept outside the repository by the builder; see the hand-back). The only official Texas host this build
 * machine could read on 17 Nov 2026 was capitol.texas.gov (Texas Legislature Online), so, as in ./calendar.ts, each
 * constitutional rule is cited to a legislative document on that site that prints the current text, and the House's
 * own rules are cited to the House resolution that adopted them for 2025 (H.R. 4, 89th Legislature).
 *
 * `reviewed` is false on all four: nothing here reaches a page or a prompt until the owner approves it.
 * `match` is conservative. A Texas rule the Primer type cannot express (for example "this bill is in a called
 * session") is left empty rather than approximated: see the note on each primer.
 *
 * Pure: imports only a type, so the tests load it directly.
 */
import type { Primer, PrimerContext } from "../analysis/primers.ts";

const TLO = "https://capitol.texas.gov";
/** Texas Constitution, Art. III, Secs. 2, 3, 4, 5, 32 and 39, and Art. IV, Sec. 16, as printed in H.J.R. 62 (1999). */
const HJR62_1999 = `${TLO}/tlodocs/76R/billtext/html/HJ00062F.htm`;
/** Texas Constitution, Art. III, Sec. 9(a) and Art. IV, Sec. 16(b) and (d), as printed in H.J.R. 44 (1999). */
const HJR44_1999 = `${TLO}/tlodocs/76R/billtext/html/HJ00044F.htm`;
/** Texas Constitution, Art. III, Sec. 5(a) and Sec. 24(b), as printed in H.J.R. 52 (2021). */
const HJR52_2021 = `${TLO}/tlodocs/87R/billtext/html/HJ00052I.htm`;
/** Texas Constitution, Art. III, Sec. 5(b) and (c), as printed in H.J.R. 113 (2023). */
const HJR113_2023 = `${TLO}/tlodocs/88R/billtext/html/HJ00113I.htm`;
/** Texas Constitution, Art. IV, Sec. 4 and Sec. 16(a), as printed in H.J.R. 72 (2017). */
const HJR72_2017 = `${TLO}/tlodocs/85R/billtext/html/HJ00072I.htm`;
/** Texas Constitution, Art. IV, Sec. 14, as printed in S.J.R. 39 (2025). */
const SJR39_2025 = `${TLO}/tlodocs/89R/billtext/html/SJ00039E.htm`;
/** Texas Constitution, Art. III, Sec. 40, as printed in S.J.R. 53 (2025). */
const SJR53_2025 = `${TLO}/tlodocs/89R/billtext/html/SJ00053I.htm`;
/** Texas Constitution, Art. IV, Sec. 8(a), as printed in H.J.R. 192 (2025). */
const HJR192_2025 = `${TLO}/tlodocs/89R/billtext/html/HJ00192I.htm`;
/** Texas Government Code, Sec. 301.001, as printed in H.B. 561 (2023). Same page as ./calendar.ts. */
const HB561_2023 = `${TLO}/tlodocs/88R/billtext/html/HB00561I.htm`;
/** Rules of the Texas House for 2025: H.R. 4, 89th Legislature, as adopted. */
const HOUSE_RULES = `${TLO}/tlodocs/89R/billtext/html/HR00004F.htm`;
/** How the House elects its Speaker: H.R. 1, 89th Legislature, as adopted. */
const HR1_2025 = `${TLO}/tlodocs/89R/billtext/html/HR00001F.htm`;
/** The Senate's rules for 2025: S.R. 2, 89th Legislature (Senate Rule 11.02, committees). */
const SR2_2025 = `${TLO}/tlodocs/89R/billtext/html/SR00002F.htm`;

export const TX_PRIMERS: Primer[] = [
  { id: "tx-how-a-bill-passes", kind: "process", title: "How the Texas Legislature passes a bill",
    bullets: [
      "The Texas Legislature has two chambers: a Senate of 31 members and a House of Representatives of 150. Voters elect senators for four-year terms and representatives for two-year terms.",
      "A new bill is sent to a committee, a small group of members who handle one subject. In the House, the committee's chair decides whether the bill gets a public hearing, where people can testify. If the committee votes to approve the bill, it moves on toward a vote of the full chamber.",
      "Each chamber must read a bill on three separate days. At the first reading it is sent to a committee. On the second reading, members debate and can change it. A House bill that passes this vote is \"passed to engrossment\": a clean official copy is made for the third reading, the final vote.",
      "A bill goes to the Governor only after both chambers pass it. If the Senate changes a House bill, the House can accept the changes or ask for a conference committee (five members from each chamber who try to settle the differences). The House must then accept or reject the group's report as a whole.",
      "Some questions are decided by voice: members answer \"Aye\" or \"No\" together, and how each one voted is not written down. A record vote lists each member's vote. In the House any member can ask for one, and the final vote on a bill is always recorded."],
    sources: [
      { label: "Texas Constitution, Art. III, Secs. 2, 3, 4 and 32 (as printed in H.J.R. 62, 1999)", url: HJR62_1999 },
      { label: "Texas House Rules 2025: Rule 1, Sec. 7 (voice votes); Rule 4 (committees); Rule 5, Sec. 51 (record votes); Rule 8, Secs. 6, 15 and 17 (readings); Rule 13 (conference committees)", url: HOUSE_RULES },
      { label: "Texas Constitution, Art. IV, Sec. 14 (bills go to the Governor; as printed in S.J.R. 39, 2025)", url: SJR39_2025 },
      { label: "Texas Legislature Online: how individual votes are recorded", url: `${TLO}/resources/FAQ.aspx` }],
    // A reader meets these words in a bill's own action list ("Passed to engrossment", "Passed to 3rd reading",
    // "Conference committee report adopted"). Only bills that reached a floor vote carry them.
    lawAsOf: "2026-11-17", reviewed: false, match: { actions: /\bpassed to (?:engrossment|3rd reading|third reading)\b|\bconference committee\b|\bconferees\b/i } },

  { id: "tx-lieutenant-governor-and-speaker", kind: "process", title: "The Lieutenant Governor and the Speaker",
    bullets: [
      "The Lieutenant Governor runs the meetings of the Texas Senate. Voters elect the Lieutenant Governor at the same election as the Governor, for the same four-year term. When the Senate is tied, the Lieutenant Governor can cast the deciding vote.",
      "At the start of each regular session, the Lieutenant Governor picks the members of the Senate's committees, the small groups that work on bills on one subject before the full Senate votes.",
      "The Speaker runs the meetings of the House. For each new Legislature, the House elects the Speaker from its own members, so the Speaker is also a representative. The Speaker can vote like any other member.",
      "The Speaker sends each House bill to a committee; a majority of the House can change that choice. The Speaker names each committee's chair and at least half of its other members, and picks all members of the Calendars Committee, which votes on whether a bill is put on the schedule for a House vote.",
      "The Senate also elects one of its members as a stand-in leader. If the office of Lieutenant Governor becomes empty, as when the Lieutenant Governor becomes Governor, the stand-in calls all senators together within 30 days. They elect one senator to do the job until the next general election. Until then, the stand-in does it."],
    sources: [
      { label: "Texas Constitution, Art. IV, Sec. 16(a) (election and term; as printed in H.J.R. 72, 2017)", url: HJR72_2017 },
      { label: "Texas Constitution, Art. IV, Sec. 16(b) and (d), and Art. III, Sec. 9(a) (presiding, tie votes, vacancy; as printed in H.J.R. 44, 1999)", url: HJR44_1999 },
      { label: "Texas Senate Rule 11.02 (committees appointed by the President of the Senate; S.R. 2, 2025)", url: SR2_2025 },
      { label: "H.R. 1, 2025: the House elects its Speaker from its own members (Art. III, Sec. 9(b))", url: HR1_2025 },
      { label: "Texas House Rules 2025: Rule 1, Secs. 4, 8, 15 and 16; Rule 4, Sec. 2; Rule 6, Secs. 19 and 20", url: HOUSE_RULES }],
    // Background on who runs each chamber; no bill's title, text or actions show when it is needed. None by default:
    // the lead can link it from the Texas overview page instead.
    lawAsOf: "2026-11-17", reviewed: false, match: {} },

  { id: "tx-session-calendar", kind: "process", title: "When the Texas Legislature meets and when new laws start",
    bullets: [
      "The Legislature meets in a regular session every two years. It opens at noon on the second Tuesday of January in odd-numbered years and can last at most 140 days.",
      "The first 30 days are set aside for filing bills, approving people the Governor appointed between sessions, and emergencies the Governor names. Committees hold hearings in the next 30 days. After that, the full House and Senate act on bills. A chamber can change this order with a four-fifths vote of its members.",
      "Lawmakers can file bills early, from the first Monday after the general election. Under the House's 2025 rules, after the first 60 days a new bill needs a yes from four-fifths of the House members present and voting to be filed. Bills about one local area and the Governor's emergency matters are exempt.",
      "The Governor has 10 days, not counting Sundays, to sign a bill or veto (reject) it. If the session ends first, the Governor has 20 days after it ends. A bill not vetoed in time becomes law. A two-thirds vote in each chamber can override a veto and make the bill law.",
      "A new law takes effect on the 91st day after the session ends, unless two-thirds of all members of each chamber vote for an earlier date. The state budget bill is not covered by this rule."],
    sources: [
      { label: "Texas Government Code, Sec. 301.001 (noon on the second Tuesday in January; as printed in H.B. 561, 2023)", url: HB561_2023 },
      { label: "Texas Constitution, Art. III, Secs. 5(a) and 24(b) (every two years; 140 days; as printed in H.J.R. 52, 2021)", url: HJR52_2021 },
      { label: "Texas Constitution, Art. III, Sec. 5(b) and (c) (the first 30 and 60 days; as printed in H.J.R. 113, 2023)", url: HJR113_2023 },
      { label: "Texas House Rules 2025: Rule 8, Secs. 7, 8 and 19 (early filing, the 60-day rule, effective dates)", url: HOUSE_RULES },
      { label: "Texas Constitution, Art. IV, Sec. 14 (the Governor's deadlines; as printed in S.J.R. 39, 2025)", url: SJR39_2025 },
      { label: "Texas Constitution, Art. III, Sec. 39 (when laws take effect; as printed in H.J.R. 62, 1999)", url: HJR62_1999 }],
    // General background; the 2027 dates themselves are on the Texas page's key-dates list (./calendar.ts). None by default.
    lawAsOf: "2026-11-17", reviewed: false, match: {} },

  { id: "tx-special-sessions", kind: "process", title: "Special sessions of the Texas Legislature",
    bullets: [
      "Outside its regular session every two years, the Legislature meets only when the Governor calls it into a special session (also called a called session). The Governor's order must state its purpose.",
      "A special session can last at most 30 days. Lawmakers may pass laws only on subjects the Governor names, either in the order that calls the session or later, while it meets.",
      "The Governor can call more than one. In 2023 the Legislature held its regular session and then four special sessions.",
      "Bills are filed for one session at a time, and each session numbers its bills from 1. Lawmakers may file bills up to 30 days before a special session. A bill that failed in the regular session can come back only if it is filed again and its subject is on the Governor's list."],
    sources: [
      { label: "Texas Constitution, Art. III, Sec. 5(a) (meetings when convened by the Governor; as printed in H.J.R. 52, 2021)", url: HJR52_2021 },
      { label: "Texas Constitution, Art. IV, Sec. 8(a) (the Governor's order states the purpose; as printed in H.J.R. 192, 2025)", url: HJR192_2025 },
      { label: "Texas Constitution, Art. III, Sec. 40 (30 days; the Governor's subjects; as printed in S.J.R. 53, 2025)", url: SJR53_2025 },
      { label: "Texas Legislature Online: bills filed in the 88th Legislature's four called sessions, 2023", url: `${TLO}/Reports/Report.aspx?LegSess=884&ID=housefiled` },
      { label: "Texas House Rules 2025: Rule 8, Secs. 6 and 7 (filing and numbering; filing before a special session)", url: HOUSE_RULES }],
    // Should attach to every bill of a called session (session ids like "891", "892"). The Primer type matches only
    // the title, text and actions, which do not carry the session, so `match` is left empty; see the hand-back.
    lawAsOf: "2026-11-17", reviewed: false, match: {} },
];

/** The Texas primers that apply to a bill: the same rule as `primersFor` in lib/analysis/primers.ts, over TX_PRIMERS. */
export function txPrimersFor(ctx: PrimerContext, includeUnreviewed = false): Primer[] {
  return TX_PRIMERS.filter(p => (p.reviewed || includeUnreviewed) && ((p.match.title?.test(ctx.title) ?? false) || (p.match.text?.test(ctx.text) ?? false) || (p.match.actions?.test(ctx.actions) ?? false)));
}

export const txPrimerById = (id: string) => TX_PRIMERS.find(p => p.id === id) ?? null;
