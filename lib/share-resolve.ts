import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialRollCalls } from "@/db/schema";
import type { Card } from "@/lib/card-content";
import type { Slide } from "@/components/cards/card-image";
import { voteCardFor } from "@/lib/cards";
import { captionFromCard } from "@/lib/share-rules";
import { billLabel } from "@/components/federal/badges";
import { billCard, breakingRanksCard, memberCard, carouselSlides, dashboardCard, districtVsLegislatorCard, quietKillCard, saidVsDidCard, saidVsDidPairs } from "@/lib/share-cards";

/**
 * Round G: one place that turns a share request into a card (or carousel), the
 * plain-facts caption that travels beside it, the links to the exact items, and
 * whether every block on it is Official (only those may ever auto-post).
 */
export const SHARE_TYPES = ["bill", "member", "vote", "quiet", "ranks", "district", "saiddid", "dash", "carousel"] as const;
export type ShareType = (typeof SHARE_TYPES)[number];
export type ShareParams = Record<string, string | undefined>;
export type Resolved = { type: ShareType; title: string; card: Card | null; slides: Slide[] | null; caption: string; links: { label: string; href: string }[]; officialOnly: boolean; query: string };

const MEMBER = /^[A-Z]\d{6}$/, ROLL = /^[a-z0-9-]{5,40}$/, BILL = /^[a-z0-9-]{4,40}$/, PUB = /^[A-Za-z0-9_-]{6,64}$/;
const ok = (v: string | undefined, re: RegExp) => !!v && re.test(v);
export function shareQuery(type: ShareType, p: ShareParams) {
  const keys = { bill: ["bill"], member: ["member"], vote: ["member", "roll"], quiet: ["roll"], ranks: ["member", "roll"], district: ["member", "bill"], saiddid: ["pub"], dash: ["kind"], carousel: ["bill"] }[type];
  return `t=${type}${keys.map(k => `&${k}=${encodeURIComponent(p[k] ?? "")}`).join("")}`;
}
export function validShare(type: string | undefined, p: ShareParams): type is ShareType {
  switch (type) {
    case "vote": case "ranks": return ok(p.member, MEMBER) && ok(p.roll, ROLL);
    case "quiet": return ok(p.roll, ROLL);
    case "bill": return ok(p.bill, BILL);
    case "member": return ok(p.member, MEMBER);
    case "district": return ok(p.member, MEMBER) && ok(p.bill, BILL);
    case "saiddid": return ok(p.pub, PUB);
    case "dash": return p.kind === "funnel" || p.kind === "control" || p.kind === "players";
    case "carousel": return ok(p.bill, BILL);
    default: return false;
  }
}
const officialOnly = (c: Card | null) => !!c && c.lines.every(l => l.describe.label === "Official");
const captionOf = (c: Card) => captionFromCard(c);

async function billOfRoll(roll: string) {
  const r = await getDb().select({ billId: officialRollCalls.billId }).from(officialRollCalls).where(eq(officialRollCalls.id, roll)).get();
  return r?.billId ?? null;
}

export async function resolveShare(type: string | undefined, p: ShareParams): Promise<Resolved | null> {
  if (!validShare(type, p)) return null;
  const query = shareQuery(type, p);
  const base = (title: string, card: Card | null, links: Resolved["links"]): Resolved | null => card ? { type, title, card, slides: null, caption: captionOf(card), links, officialOnly: officialOnly(card), query } : null;
  const billLinks = (billId: string | null) => billId ? [{ label: "The bill and every vote on it", href: `/bills/${billId}` }] : [];
  switch (type) {
    case "vote": { const v = await voteCardFor(p.member!, p.roll!); return v ? base(`How ${v.member} voted`, v.card, [{ label: v.member, href: `/politicians/${p.member}` }, ...billLinks(await billOfRoll(p.roll!))]) : null; }
    case "bill": { const c = await billCard(p.bill!); return base(c?.eyebrow.split(" · ")[1] ?? "Bill", c, billLinks(p.bill!)); }
    case "member": { const c = await memberCard(p.member!); return base(c ? `How ${c.title} voted` : "", c, [{ label: c?.title ?? "Member", href: `/politicians/${p.member}` }]); }
    case "quiet": return base("Stopped by a procedural vote", await quietKillCard(p.roll!), billLinks(await billOfRoll(p.roll!)));
    case "ranks": { const c = await breakingRanksCard(p.member!, p.roll!); return base(c ? `${c.title} broke with their party` : "", c, [{ label: c?.title ?? "Member", href: `/politicians/${p.member}` }, ...billLinks(await billOfRoll(p.roll!))]); }
    case "district": { const c = await districtVsLegislatorCard(p.member!, p.bill!); return base("My district vs my legislator", c, [{ label: "The member's record", href: `/politicians/${p.member}` }, ...billLinks(p.bill!)]); }
    case "saiddid": { const c = await saidVsDidCard(p.pub!); const pair = c ? (await saidVsDidPairs(200)).find(x => x.publicationId === p.pub) : null;
      return base(c ? `${c.title}: said and did` : "", c, pair ? [{ label: pair.speaker, href: `/politicians/${pair.memberId}` }, ...billLinks(pair.billId), { label: "The published statement", href: `/records/${pair.representationId}` }] : []); }
    case "dash": return base(p.kind === "funnel" ? "The bill funnel" : p.kind === "control" ? "Who controls Congress" : "Key players in Congress", await dashboardCard(p.kind as "funnel" | "control" | "players"), [{ label: "The full dashboard", href: "/dashboard" }]);
    case "carousel": {
      const slides = await carouselSlides(p.bill!);
      if (!slides) return null;
      const b = await getDb().select({ billType: officialBills.billType, number: officialBills.number, title: officialBills.title }).from(officialBills).where(eq(officialBills.id, p.bill!)).get();
      const label = b ? billLabel(b.billType, b.number) : "This bill";
      return { type, title: `${label}, explained in 5 slides`, card: null, slides, caption: `${label}: ${slides[0].heading}. What it does, who it affects, the case for and against, and where it stands.`, links: billLinks(p.bill!), officialOnly: false, query };
    }
  }
}
