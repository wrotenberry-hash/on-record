import { notFound } from "next/navigation";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { resolveShare } from "@/lib/share-resolve";
import { SITE } from "@/lib/share";

/**
 * Round G embeddable vote and bill cards, for other sites to show in an iframe.
 * They answer only when public reading is on; while the site is private they 404,
 * so nothing is visible beyond trial invites.
 */
export async function EmbedCard({ type, params }: { type: "vote" | "bill"; params: Record<string, string | undefined> }) {
  if (!publicReadEnabled(process.env[PUBLIC_READ_FLAG])) notFound();
  const r = await resolveShare(type, params);
  if (!r?.card) notFound();
  const c = r.card, href = `${SITE}/share/card?${r.query}`;
  return <main className="embed-card">
    <div className="eyebrow">{c.eyebrow}</div>
    <p className="embed-title">{c.title}</p>
    {c.lines.map((l, i) => <div key={i} className="embed-line"><b>{l.vote}</b><span>{l.what}</span>
      <span><span className={`ctype ctype-${l.describe.label === "Readers" ? "opinion" : l.describe.label.toLowerCase()}`}>{l.describe.label}</span> {l.describe.text}</span>
      <small>{l.date} · Source: {l.source}</small></div>)}
    {c.note && <p className="meta">{c.note}</p>}
    <p className="embed-foot"><b>Talk is cheap.</b> <a href={href} target="_blank" rel="noopener">ON RECORD — see the full record</a></p>
  </main>;
}
