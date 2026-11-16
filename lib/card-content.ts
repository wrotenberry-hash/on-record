/**
 * What a share card says (Round 3). Pure; tested in tests/trial.test.mjs. Cards
 * are built only from record data: never from anything a reader types. A reader's
 * own caption travels beside the image in the share sheet, never on it.
 *
 * Every vote line carries the member's actual vote, the kind of vote (a procedural
 * vote is labelled as one), the date, the bill's one-line headline labelled
 * "Analysis" (or its official title labelled "Official" when there is no
 * summary yet), and the official source. Footer: "Talk is cheap."
 */

export const CARD_FORMATS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 }, link: { width: 1200, height: 630 } } as const;
export type CardFormat = keyof typeof CARD_FORMATS;
export function cardFormat(value: string | null | undefined): CardFormat { return value === "story" || value === "link" ? value : "feed"; }

/** voteText and kindLabel come from lib/federal/vote-kinds (positionLine, KIND_LABEL); passed in so this file stays import-free. */
export type CardVote = { billLabel: string; billTitle: string; headline: string | null; voteText: string; kind: string; kindLabel: string; votedAt: number; sourceUrl: string };
export type CardBlock = { label: "Analysis" | "Official" | "Readers"; text: string };
export type CardLine = { what: string; describe: CardBlock; vote: string; kindLabel: string; date: string; source: string };
export type Card = { eyebrow: string; title: string; subtitle: string; lines: CardLine[]; note: string | null; footer: string };

const date = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
/** "clerk.house.gov/evs/2026/roll323.xml" without the scheme, so it reads as an address. */
export function sourceText(url: string) { return url.replace(/^https?:\/\//, "").replace(/^www\./, ""); }
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

export function voteLine(v: CardVote): CardLine {
  return { what: v.headline ? `${v.billLabel}: ${clip(v.billTitle, 90)}` : v.billLabel, describe: v.headline ? { label: "Analysis", text: clip(v.headline, 140) } : { label: "Official", text: clip(v.billTitle, 140) },
    vote: v.voteText, kindLabel: v.kindLabel, date: date(v.votedAt), source: sourceText(v.sourceUrl) };
}

export function voteCard(member: { name: string; seat: string }, v: CardVote): Card {
  return { eyebrow: "HOW THEY VOTED", title: member.name, subtitle: member.seat, lines: [voteLine(v)],
    note: v.kind === "procedural" ? "A procedural vote decides how the chamber proceeds. It is not a vote on the bill itself." : null, footer: "Talk is cheap." };
}

export function agreementCard(member: { name: string; seat: string }, issueName: string, agreed: number, differed: number, votes: CardVote[]): Card {
  const total = agreed + differed;
  return { eyebrow: `MY VIEWS AND THEIR VOTES · ${issueName.toUpperCase()}`, title: member.name, subtitle: `${member.seat} · we agreed on ${agreed} of ${total} bill${total === 1 ? "" : "s"}`,
    lines: votes.slice(0, 3).map(voteLine), note: "My own Support/Oppose answers compared with their votes on passing each bill. Not a rating by On Record.", footer: "Talk is cheap." };
}
