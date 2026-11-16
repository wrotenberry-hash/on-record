import type { Card, CardFormat } from "@/lib/card-content";

/**
 * The card drawn as an image (next/og). Plain flex layout, On Record's colours,
 * every vote line badged; sizes scale with the format so the text stays legible
 * in a Story, a feed post and a link preview.
 */
export function CardImage({ card, format }: { card: Card; format: CardFormat }) {
  const s = format === "story" ? 1.25 : format === "link" ? 0.72 : 1;
  const px = (n: number) => Math.round(n * s);
  const badge = (label: string) => <span style={{ fontSize: px(20), fontWeight: 700, letterSpacing: 1, padding: `${px(4)}px ${px(10)}px`, borderRadius: 4,
    background: label === "Analysis" ? "#eae6f4" : "#e3efe6", color: label === "Analysis" ? "#45366e" : "#245236", marginRight: px(12) }}>{label.toUpperCase()}</span>;
  return <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f7f6f2", color: "#172224", padding: px(64), fontFamily: "sans-serif" }}>
    <div style={{ display: "flex", fontSize: px(24), letterSpacing: 3, color: "#4f6b68", fontWeight: 700 }}>{card.eyebrow}</div>
    <div style={{ display: "flex", fontSize: px(64), fontWeight: 700, marginTop: px(18), lineHeight: 1.1 }}>{card.title}</div>
    <div style={{ display: "flex", fontSize: px(28), color: "#3d5353", marginTop: px(10) }}>{card.subtitle}</div>
    <div style={{ display: "flex", flexDirection: "column", marginTop: px(40), gap: px(28), flexGrow: 1, justifyContent: format === "link" ? "flex-start" : "center" }}>
      {card.lines.map((l, i) => <div key={i} style={{ display: "flex", flexDirection: "column", background: "#ffffff", border: "2px solid #d9ded9", borderRadius: 8, padding: px(28) }}>
        <div style={{ display: "flex", fontSize: px(22), color: "#4f6b68", fontWeight: 700 }}>{`${l.date} · ${l.kindLabel.toUpperCase()}`}</div>
        <div style={{ display: "flex", fontSize: px(38), fontWeight: 700, marginTop: px(10), lineHeight: 1.2 }}>{l.vote}</div>
        <div style={{ display: "flex", fontSize: px(24), color: "#3d5353", marginTop: px(12) }}>{l.what}</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: px(14), flexWrap: "wrap" }}>{badge(l.describe.label)}<span style={{ fontSize: px(28), lineHeight: 1.3 }}>{l.describe.text}</span></div>
        <div style={{ display: "flex", fontSize: px(20), color: "#4f6b68", marginTop: px(14) }}>{`Official source: ${l.source}`}</div>
      </div>)}
      {card.note && <div style={{ display: "flex", fontSize: px(24), color: "#3d5353", lineHeight: 1.35 }}>{card.note}</div>}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "3px solid #163b3c", paddingTop: px(24), marginTop: px(24) }}>
      <span style={{ fontSize: px(40), fontWeight: 700 }}>{card.footer}</span>
      <span style={{ fontSize: px(26), fontWeight: 700, letterSpacing: 2, color: "#163b3c" }}>ON RECORD</span>
    </div>
  </div>;
}
