/**
 * The order of a briefing's items (owner, 20 Nov 2026): "items where the reader's own legislators cast a vote come
 * first, then by how many people the bill affects. Tell me the rule you use."
 *
 * The rule, in full:
 *   1. An item on which one of the reader's own legislators cast a recorded vote (Yes, No or Present) comes before one
 *      on which none did.
 *   2. Then by reach, read from the approved summary's own words (its headline, its plain-English part and its "what
 *      it does" lines) by the fixed rules below. Nothing is estimated and no model is asked.
 *        5  the whole country: the summary speaks of all Americans, taxpayers, voters or workers, of a rule
 *           "nationwide", or of keeping the federal government funded
 *        4  a stated number of people of one million or more
 *        3  a stated number of people under one million
 *        2  a group of people named, with no number
 *        1  one place, one tribe, one memorial, one building or one named institution
 *        0  no approved summary yet, so the reach is not known
 *      Within 4 and 3 the larger number comes first.
 *   3. Then, as before: what was decided before what is coming, newest first.
 *
 * It can only know what the summary says: a bill whose summary gives no number sits at 2 even if it touches millions.
 * Pure (no imports), so node's test runner loads it: tests/briefing-order.test.mjs.
 */
export type Reach = { tier: 0 | 1 | 2 | 3 | 4 | 5; /** The largest number of people the summary states, when it states one. */ people: number | null };

const COUNTRY = /\b(?:all|every|most) (?:americans?|taxpayers?|voters?|workers?|households?|adults?|citizens?)\b|\bnationwide\b|\bacross the country\b|\b(?:federal )?government (?:shutdown|funded|open|running)\b|\bfunds? (?:the )?federal (?:government|agencies)\b|\bavoid a shutdown\b|\bto vote in federal elections\b|\bphoto id to vote\b|\bregister(?:ing)? to vote\b/i;
const ONE_PLACE = /\b(?:memorial|monument|statue|post office|courthouse|reservation|national (?:park|monument|historic site|scenic trail|forest|wildlife refuge)|a [A-Z][a-z]+ (?:tribe|band|nation|pueblo)|the [A-Z][A-Za-z' ]+ (?:Tribe|Band|Nation|Pueblo)|(?:tribe|band|pueblo)\b[^.]{0,60}\b(?:acres|land|reservation))\b/;
const PEOPLE = "people|persons|americans|workers|employees|retirees|veterans|troops|service members|students|families|households|patients|children|kids|adults|seniors|residents|borrowers|voters|farmers|ranchers|customers|taxpayers|women|men|immigrants|beneficiaries|enrollees|drivers|teachers|officers|owners|businesses";
const COUNT = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(thousand|million|billion)?\\s+(?:[a-z-]+\\s+){0,3}?(?:${PEOPLE})\\b`, "gi");
const UNIT: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

/** The largest count of people a text states ("about 58,000 combat-injured military retirees" → 58000); null when it states none. */
export function peopleStated(text: string): number | null {
  let most: number | null = null;
  for (const m of text.matchAll(COUNT)) {
    const n = Number(m[1].replace(/,/g, "")) * (UNIT[(m[2] ?? "").toLowerCase()] ?? 1);
    // A year or a dollar figure is not a count of people.
    if (!Number.isFinite(n) || n < 2 || /^\$/.test(text.slice(Math.max(0, m.index! - 1), m.index!)) || (/^(?:19|20)\d{2}$/.test(m[1]) && !m[2])) continue;
    if (most === null || n > most) most = n;
  }
  return most;
}

/** `summary` is the approved summary's words, or null when the bill has none readers can see. */
export function reachOf(summary: { headline: string; plainEnglish?: string | null; whatItDoes?: ReadonlyArray<{ text: string }> | null } | null): Reach {
  if (!summary || !summary.headline.trim()) return { tier: 0, people: null };
  const text = [summary.headline, summary.plainEnglish ?? "", ...(summary.whatItDoes ?? []).map(p => p.text)].join(" ");
  if (COUNTRY.test(text)) return { tier: 5, people: null };
  const people = peopleStated(text);
  if (people !== null) return { tier: people >= 1e6 ? 4 : 3, people };
  // One place is judged from the headline: it is what the bill is about, not something it mentions.
  return { tier: ONE_PLACE.test(summary.headline) ? 1 : 2, people: null };
}

/** Sorts larger reach first; equal reach keeps the order it had. */
export const byReach = (a: Reach, b: Reach) => b.tier - a.tier || (b.people ?? 0) - (a.people ?? 0);
