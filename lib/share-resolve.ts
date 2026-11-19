import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { officialBills, officialRollCalls } from "@/db/schema";
import { CHANGE_KEY, oneFact, type Card } from "@/lib/card-content";
import type { Slide } from "@/components/cards/card-image";
import { voteCardFor } from "@/lib/cards";
import { captionFromCard } from "@/lib/share-rules";
import { billLabel } from "@/components/federal/badges";
import { TOTAL_SCOPE } from "@/lib/entry/cards";
import { billPagePath } from "@/lib/entry/rules";
import { billLevel } from "@/lib/entry/store";
import { billCard, billChangeCard, carouselSlides, dashboardCard, districtTotalCard, memberCard, quietKillCard, rollResultCard, saidVsDidPairs, scopeOfMember, type DashKind } from "@/lib/share-cards";

/**
 * Round G: one place that turns a share request into a card (or carousel), the
 * plain-facts caption that travels beside it, the links to the exact items, and
 * whether every block on it is Official (only those may ever auto-post).
 *
 * 18 Nov 2026 (owner's point 10): ONE SOURCED FACT PER CARD. The three kinds are a vote ("vote": one member's
 * vote; "roll" and "quiet": one roll call's result), a bill change ("change") and a district total ("total").
 * "bill" and "member" stay as the link previews of their pages, one fact each, and "dash" as one figure.
 * Older links keep working and now open one fact: "ranks" and "saiddid" open the vote alone, "district" opens the
 * district's total alone, "dash" with kind "control" opens the House seats. "dash" with kind "players" is retired.
 * A card that does not carry exactly one fact with its date and source is never handed out (`oneFact`).
 */
export const SHARE_TYPES = ["bill", "member", "vote", "roll", "quiet", "change", "total", "ranks", "district", "saiddid", "dash", "carousel"] as const;
export type ShareType = (typeof SHARE_TYPES)[number];
export type ShareParams = Record<string, string | undefined>;
export type Resolved = { type: ShareType; title: string; card: Card | null; slides: Slide[] | null; caption: string; links: { label: string; href: string }[]; officialOnly: boolean; query: string;
  /** The one bill the card is about, when there is one: the reader's stance can be added only then. */
  billKey: string | null };

const MEMBER = /^[A-Z]\d{6}$/, ROLL = /^[a-z0-9-]{5,40}$/, BILL = /^[a-z0-9-]{4,40}$/, PUB = /^[A-Za-z0-9_-]{6,64}$/;
const DASH_KINDS = ["funnel", "house", "senate", "control", "players"];
const KEYS: Record<ShareType, string[]> = { bill: ["bill"], member: ["member"], vote: ["member", "roll"], roll: ["roll"], quiet: ["roll"], change: ["bill", "c"], total: ["bill", "scope"],
  ranks: ["member", "roll"], district: ["member", "bill"], saiddid: ["pub"], dash: ["kind"], carousel: ["bill"] };
const ok = (v: string | undefined, re: RegExp) => !!v && re.test(v);
export function shareQuery(type: ShareType, p: ShareParams) {
  return `t=${type}${KEYS[type].map(k => `&${k}=${encodeURIComponent(p[k] ?? "")}`).join("")}`;
}
export function validShare(type: string | undefined, p: ShareParams): type is ShareType {
  switch (type) {
    case "vote": case "ranks": return ok(p.member, MEMBER) && ok(p.roll, ROLL);
    case "quiet": case "roll": return ok(p.roll, ROLL);
    case "bill": case "carousel": return ok(p.bill, BILL);
    case "change": return ok(p.bill, BILL) && ok(p.c, CHANGE_KEY);
    case "total": return ok(p.bill, BILL) && ok(p.scope, TOTAL_SCOPE);
    case "member": return ok(p.member, MEMBER);
    case "district": return ok(p.member, MEMBER) && ok(p.bill, BILL);
    case "saiddid": return ok(p.pub, PUB);
    case "dash": return DASH_KINDS.includes(p.kind ?? "");
    default: return false;
  }
}
/** A card that was taken off the share menu because it could not be brought to one fact. The plain reason, for its old links. */
export function retiredShare(type: string | undefined, p: ShareParams): string | null {
  return type === "dash" && p.kind === "players" ? "This card listed several people at once. Share cards now carry one fact each, so it is no longer made. The dashboard still lists who holds each role." : null;
}
const officialOnly = (c: Card | null) => !!c && c.lines.every(l => l.describe.label === "Official");

async function billOfRoll(roll: string) {
  const r = await getDb().select({ billId: officialRollCalls.billId }).from(officialRollCalls).where(eq(officialRollCalls.id, roll)).get();
  return r?.billId ?? null;
}

export async function resolveShare(type: string | undefined, p: ShareParams): Promise<Resolved | null> {
  if (!validShare(type, p) || retiredShare(type, p)) return null;
  const made = (as: ShareType, params: ShareParams, title: string, card: Card | null, links: Resolved["links"], billKey: string | null): Resolved | null =>
    card && oneFact(card) ? { type: as, title, card, slides: null, caption: captionFromCard(card), links, officialOnly: officialOnly(card), query: shareQuery(as, params), billKey } : null;
  const billLinks = async (billId: string | null) => { const level = billId ? await billLevel(getDb(), billId) : null; return billId && level ? [{ label: "The bill and every vote on it", href: billPagePath(billId, level) }] : []; };
  const vote = async (member: string, roll: string) => {
    const v = await voteCardFor(member, roll), billId = await billOfRoll(roll);
    return v ? made("vote", { member, roll }, `How ${v.member} voted`, v.card, [{ label: v.member, href: `/politicians/${member}` }, ...await billLinks(billId)], billId) : null;
  };
  const total = async (bill: string, scope: string) => made("total", { bill, scope }, `What counted residents of ${scope} said`, await districtTotalCard(bill, scope), await billLinks(bill), bill);
  switch (type) {
    case "vote": case "ranks": return vote(p.member!, p.roll!); // "ranks": the vote alone; the party's count is on the member's page
    case "saiddid": { const pair = (await saidVsDidPairs(200)).find(x => x.publicationId === p.pub); return pair ? vote(pair.memberId, pair.rollId) : null; } // the vote alone
    case "roll": { const r = await rollResultCard(p.roll!); return r ? made("roll", p, `${r.card.title}: how the vote went`, r.card, await billLinks(r.billKey), r.billKey) : null; }
    case "quiet": { const billId = await billOfRoll(p.roll!); return made("quiet", p, "Stopped by a procedural vote", await quietKillCard(p.roll!), await billLinks(billId), billId); }
    case "change": { const c = await billChangeCard(p.bill!, p.c!); return made("change", p, c ? `${c.title}: one change to the bill` : "", c, await billLinks(p.bill!), p.bill!); }
    case "total": return total(p.bill!, p.scope!);
    case "district": { const scope = await scopeOfMember(p.member!); return scope ? total(p.bill!, scope) : null; } // the district's total alone
    case "bill": { const c = await billCard(p.bill!); return made("bill", p, c?.eyebrow.split(" · ")[1] ?? "Bill", c, await billLinks(p.bill!), p.bill!); }
    case "member": { const c = await memberCard(p.member!); return made("member", p, c ? `How ${c.title} voted` : "", c, [{ label: c?.title ?? "Member", href: `/politicians/${p.member}` }], null); }
    case "dash": { const kind = (p.kind === "control" ? "house" : p.kind) as DashKind;
      return made("dash", { kind }, kind === "funnel" ? "Bills that became law" : kind === "house" ? "Seats in the House" : "Seats in the Senate", await dashboardCard(kind),
        [{ label: "The full dashboard", href: "/dashboard" }, ...(kind === "house" ? [{ label: "The same card for the Senate", href: "/share/card?t=dash&kind=senate" }] : kind === "senate" ? [{ label: "The same card for the House", href: "/share/card?t=dash&kind=house" }] : [])], null); }
    case "carousel": {
      const slides = await carouselSlides(p.bill!);
      if (!slides || slides.some(s => s.points.length !== 1 || !s.source || !s.date)) return null; // one sourced fact per slide
      const b = await getDb().select({ billType: officialBills.billType, number: officialBills.number }).from(officialBills).where(eq(officialBills.id, p.bill!)).get();
      const label = b ? billLabel(b.billType, b.number) : "This bill";
      return { type, title: `${label}, explained in 5 slides`, card: null, slides, caption: `${label}: ${slides[0].points[0].replace(/[.!?]+$/, "")}. What it does, who it affects, the latest recorded vote, and where it stands.`,
        links: await billLinks(p.bill!), officialOnly: false, query: shareQuery(type, p), billKey: null };
    }
  }
}
