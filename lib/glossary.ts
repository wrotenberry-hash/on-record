/**
 * Plain-language definitions for congressional jargon, written for about an
 * 8th-grade reader (Round B). Pure; tested in tests/search.test.mjs. Wording
 * follows the congress.gov glossary; each definition says what the thing does,
 * never whether it is good or bad.
 */
export const GLOSSARY: Record<string, string> = {
  "cloture": "A vote to end debate in the Senate so the chamber can move to a final vote. It usually needs 60 of 100 senators.",
  "filibuster": "Using the Senate's long debate rules to delay or block a vote. A cloture vote can end it.",
  "suspend the rules": "A fast House process for less disputed bills: debate is short, no changes are allowed, and passing needs two-thirds of those voting.",
  "suspension of the rules": "A fast House process for less disputed bills: debate is short, no changes are allowed, and passing needs two-thirds of those voting.",
  "motion to recommit": "A last House vote, before passage, to send a bill back to committee. It is a procedural vote, not a vote on the bill itself.",
  "motion to table": "A vote to set something aside without a direct vote on it. Agreeing to table it usually ends it.",
  "motion to proceed": "A Senate vote on whether to start debating a bill. It is a procedural step, not a vote on the bill.",
  "unanimous consent": "Approval without a recorded vote because no member objects.",
  "voice vote": "Members call out yes or no together; no individual votes are recorded.",
  "roll call": "A vote where each member's yes or no is recorded by name.",
  "recorded vote": "A vote where each member's yes or no is recorded by name.",
  "quorum": "The smallest number of members who must be present for the chamber to do business.",
  "engrossed": "The official copy of a bill as passed by one chamber.",
  "enrolled": "The final official copy of a bill passed by both chambers, sent to the President.",
  "reported": "A committee has finished with the bill and sent it to the full chamber, often with changes.",
  "markup": "A committee meeting where members debate and change a bill before deciding whether to send it on.",
  "referred": "Sent to a committee to study before the full chamber considers it.",
  "conference report": "The final version both chambers' negotiators agree on when the House and Senate passed different versions.",
  "conference": "A meeting of House and Senate negotiators to settle differences between their versions of a bill.",
  "veto": "The President's refusal to sign a bill. Congress can override it with two-thirds of both chambers.",
  "pocket veto": "A bill dies because the President does not sign it within 10 days while Congress is adjourned.",
  "override": "Congress passing a bill again by two-thirds of both chambers after a veto, so it becomes law anyway.",
  "joint resolution": "A measure like a bill: it can become law if both chambers pass it and the President signs it. Also used to propose constitutional amendments.",
  "concurrent resolution": "A measure both chambers pass on shared business, such as their own rules. It does not go to the President and is not law.",
  "simple resolution": "A measure only one chamber passes, about that chamber's own business or opinions. It is not law.",
  "resolution": "A formal statement a chamber votes on. Joint resolutions can become law; simple and concurrent resolutions do not.",
  "appropriations": "Bills that set how much money federal agencies can spend.",
  "authorization": "A law that creates or continues a program and says how much money it may get. Separate appropriations actually provide the money.",
  "reconciliation": "A budget process that lets some tax and spending bills pass the Senate with a simple majority and limited debate.",
  "discharge petition": "A way for a majority of House members to force a bill out of committee and onto the floor.",
  "amendment in the nature of a substitute": "An amendment that replaces the whole text of a bill with new text.",
  "two-thirds": "Two out of every three members voting. Needed to pass bills under suspension of the rules and to override a veto.",
  "cbo": "The Congressional Budget Office, a nonpartisan office that estimates what bills would cost.",
  "public law": "A bill that has been signed or otherwise enacted, with its official law number.",
  "sponsor": "The member who introduced the bill.",
  "cosponsor": "A member who formally adds their name in support of a bill.",
};

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

/** Splits text into plain parts and glossary terms (first time each term appears), longest match first. */
export function glossParts(text: string): Array<{ text: string; term?: string }> {
  const lower = text.toLowerCase(), used = new Set<string>(), hits: Array<{ start: number; end: number; term: string }> = [];
  for (const term of TERMS) {
    if (used.has(GLOSSARY[term])) continue;
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = re.exec(lower);
    if (!m) continue;
    const start = m.index, end = start + term.length;
    if (hits.some(h => start < h.end && end > h.start)) continue;
    hits.push({ start, end, term }); used.add(GLOSSARY[term]);
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Array<{ text: string; term?: string }> = [];
  let at = 0;
  for (const h of hits) { if (h.start > at) out.push({ text: text.slice(at, h.start) }); out.push({ text: text.slice(h.start, h.end), term: h.term }); at = h.end; }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
