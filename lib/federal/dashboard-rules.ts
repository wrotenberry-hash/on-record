/**
 * Round I dashboard rules. Pure, no imports; tested in tests/dashboard.test.mjs.
 * The same method applies to every chamber, Congress and party.
 */

export type FunnelStage = "filed" | "committee" | "passed_one" | "passed_both" | "law" | "vetoed";
export const FUNNEL_ORDER: FunnelStage[] = ["filed", "committee", "passed_one", "passed_both", "law"];
export const FUNNEL_LABEL: Record<FunnelStage, string> = { filed: "Filed", committee: "Committee action", passed_one: "Passed one chamber", passed_both: "Passed both chambers", law: "Became law", vetoed: "Vetoed" };

/**
 * Furthest stage a federal bill has reached, read from its latest official action (Congress.gov list).
 * A latest action that only happens after a step implies the step: "Received in the Senate" means it passed the House.
 */
export function stageFromLatestAction(text: string | null | undefined): FunnelStage {
  const t = String(text ?? "").toLowerCase();
  if (/became public law|became private law|signed by (the )?president/.test(t)) return "law";
  if (/vetoed|pocket veto/.test(t)) return "vetoed";
  if (/presented to (the )?president|cleared for white house|enrolled bill signed|conference report agreed to in (house|senate)|resolving differences|message on (house|senate) action sent to the (house|senate)/.test(t)) return "passed_both";
  if (/passed\/agreed to in (house|senate)|passed (house|senate)|received in the (house|senate)|placed on (the )?(senate legislative|union|house) calendar.*received|held at the desk|motion to reconsider laid on the table agreed to/.test(t)) return "passed_one";
  if (/reported|ordered to be reported|committee (consideration|hearings?)|subcommittee (consideration|hearings?)|markup|discharged|placed on (the )?(union|house|senate legislative) calendar|calendar no\./.test(t)) return "committee";
  return "filed";
}

/** Bills that reached at least each stage (a law also counts as passed both, passed one, committee and filed). Vetoed bills passed both. */
export function funnel(stages: FunnelStage[]) {
  const reach: Record<FunnelStage, number> = { filed: 0, committee: 0, passed_one: 0, passed_both: 0, law: 0, vetoed: 0 };
  const rank = (s: FunnelStage) => (s === "vetoed" ? FUNNEL_ORDER.indexOf("passed_both") : FUNNEL_ORDER.indexOf(s));
  for (const s of stages) { for (let i = 0; i <= rank(s); i++) reach[FUNNEL_ORDER[i]]++; if (s === "vetoed") reach.vetoed++; }
  const pct = (n: number) => (reach.filed ? Math.round((1000 * n) / reach.filed) / 10 : 0);
  return { reach, pct: Object.fromEntries(FUNNEL_ORDER.map(s => [s, pct(reach[s])])) as Record<FunnelStage, number> };
}

/** One plain sentence about the funnel, same template for every chamber and session. */
export function funnelTakeaway(name: string, f: ReturnType<typeof funnel>) {
  if (!f.reach.filed) return `${name}: no bills filed yet.`;
  const stall = 100 - f.pct.committee;
  return `${name}: of ${f.reach.filed.toLocaleString("en-US")} bills filed, ${f.pct.passed_one}% passed at least one chamber and ${f.reach.law.toLocaleString("en-US")} (${f.pct.law}%) became law; ${Math.round(stall * 10) / 10}% have had no committee action.`;
}

/** A party-line vote: most voting Democrats and most voting Republicans on opposite sides (each party with at least 10 voting). */
export function isPartyLine(d: { Yea?: number; Nay?: number }, r: { Yea?: number; Nay?: number }) {
  const dy = d.Yea ?? 0, dn = d.Nay ?? 0, ry = r.Yea ?? 0, rn = r.Nay ?? 0;
  if (dy + dn < 10 || ry + rn < 10 || dy === dn || ry === rn) return false;
  return (dy > dn) !== (ry > rn);
}

/** Leadership roles from congress-legislators (current file): title, chamber, start. */
export function parseLeadership(data: unknown) {
  if (!Array.isArray(data)) return [];
  return (data as Array<{ id?: { bioguide?: string }; name?: { official_full?: string; first?: string; last?: string }; leadership_roles?: Array<{ title?: string; chamber?: string; start?: string; end?: string }> }>)
    .flatMap(p => (p.leadership_roles ?? []).filter(r => r?.title && !r.end && p.id?.bioguide).map(r => ({ politicianId: p.id!.bioguide!, name: p.name?.official_full ?? `${p.name?.first ?? ""} ${p.name?.last ?? ""}`.trim(),
      title: r.title!, chamber: r.chamber === "senate" ? "senate" : "house", start: r.start ?? null })));
}

/** Role notes shown beside leaders (one line each). */
export const ROLE_NOTE: Record<string, string> = {
  "Speaker of the House": "Presides over the House and sets which bills reach the floor.",
  "President pro tempore": "Presides over the Senate when the Vice President is absent; by custom the longest-serving senator of the majority.",
  "Majority Leader": "Leads the majority party on the floor and schedules debate.",
  "Minority Leader": "Leads the minority party on the floor.",
  "Majority Whip": "Counts and gathers votes for the majority party.",
  "Minority Whip": "Counts and gathers votes for the minority party.",
  "Speaker of the Texas House": "Elected by House members; presides over the House, appoints committee chairs and refers bills to committees.",
  "Lieutenant Governor": "Elected statewide; presides over the Texas Senate, appoints its committees and refers its bills.",
  "Governor": "Signs or vetoes bills passed by both chambers; can call special sessions.",
  "President": "Signs or vetoes bills passed by both chambers of Congress.",
};
