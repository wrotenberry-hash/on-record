import { ImageResponse } from "next/og";
import { CardImage } from "@/components/cards/card-image";
import { CARD_FORMATS, cardFormat, type Card } from "@/lib/card-content";
import { latestBriefing, type Briefing } from "@/lib/briefing";
import { viewerAccess } from "@/lib/viewer";
import { countEvent } from "@/lib/events";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** The briefing as a shareable card: official items only, "Talk is cheap." footer. Gated like every card. */
export async function GET(request: Request) {
  const access = await viewerAccess();
  if (!access.allowed) return new Response("Not available", { status: 404 });
  if (!(await (await import("@/lib/share")).cardAllowed())) return new Response("Too many cards from this device. Try again in an hour.", { status: 429 });
  const url = new URL(request.url), id = url.searchParams.get("id") ?? "";
  if (!/^(daily|weekly)-\d{4}-\d{2}-\d{2}$/.test(id)) return new Response("Bad request", { status: 400 });
  const row = await latestBriefing(id);
  if (!row) return new Response("Not found", { status: 404 });
  const b = row.content as Briefing, format = cardFormat(url.searchParams.get("format"));
  const pick = [...b.congress.passed.map(i => ({ i, v: "Passed", k: "Congress" })), ...b.congress.failed.map(i => ({ i, v: "Failed", k: "Congress" })),
    ...b.congress.blocked.map(i => ({ i, v: "Stopped (procedural)", k: "Congress" })), ...(b.texas?.passed ?? []).map(i => ({ i, v: "Passed", k: "Texas" }))].slice(0, format === "link" ? 2 : 3);
  const card: Card = { eyebrow: `${b.kind === "daily" ? "DAILY" : "WEEKLY"} BRIEFING · ${b.periodLabel.toUpperCase()}`, title: "What happened", subtitle: "Congress and the Texas Legislature, from official records",
    lines: pick.map(({ i, v, k }) => ({ what: `${i.label}: ${i.title.length > 90 ? `${i.title.slice(0, 88)}…` : i.title}`, describe: { label: "Official", text: i.note.slice(0, 140) }, vote: v, kindLabel: k,
      date: new Date(i.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }), source: k === "Texas" ? "capitol.texas.gov" : "congress.gov" })),
    note: pick.length ? null : "No votes recorded in this period.", footer: BRAND.taglineShort };
  await countEvent("card_render", `briefing:${format}`);
  return new ImageResponse(<CardImage card={card} format={format} />, { ...CARD_FORMATS[format], headers: { "Cache-Control": "private, no-store" } });
}
