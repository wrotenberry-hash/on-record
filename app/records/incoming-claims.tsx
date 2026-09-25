"use client";
import { useEffect, useState } from "react";

type Item = { id: string; lane: string; medium: string; era: string; speakerName: string; exactText: string;
  proposition: string; issue: string | null; sourceUrl: string | null; capturedAt: number; publishedAt: number | null };

export default function IncomingClaims() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [withheld, setWithheld] = useState(false);
  useEffect(() => { void fetch("/api/representations", { cache: "no-store" }).then(async response => {
    // A 403 means the inventory is deliberately not public yet; show nothing rather than an error.
    if (response.status === 403) { setWithheld(true); return; }
    if (!response.ok) throw Error("Incoming claims are temporarily unavailable");
    const result = await response.json() as { representations: Item[] };
    setItems(result.representations);
  }).catch(caught => setError(caught instanceof Error ? caught.message : "Incoming claims unavailable")); }, []);
  if (withheld) return null;
  return <section className="incoming-claims" aria-label="Incoming representations">
    <div className="section-title"><h2>Incoming representations</h2><span>{items.length} awaiting review</span></div>
    <p>Captured source passages across current and historical coverage. Attribution, context and accuracy await independent editorial review; no finding is implied.</p>
    {error && <p role="alert">{error}</p>}
    <div className="incoming-lanes">{[...new Set(["Republican", "Democratic", ...items.map(item => item.lane)])].map(lane => <div key={lane}>
      <h3>{lane} sources</h3>
      {items.filter(item => item.lane === lane).slice(0, 4).map(item => <article key={item.id}>
        <small>{item.speakerName} · {item.issue || "Issue to classify"} · {item.era} {item.medium} · {item.publishedAt?`Source date ${new Date(item.publishedAt).toLocaleDateString()}`:`Date unverified; captured ${new Date(item.capturedAt).toLocaleDateString()}`}</small>
        <blockquote>“{item.exactText}”</blockquote>
        <p>Proposition: {item.proposition}</p>
        {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Open original statement ↗</a>}
        <span>CHECKING · No finding published</span>
      </article>)}
      {!items.some(item => item.lane === lane) && <p className="incoming-empty">No original statement captured in this lane yet.</p>}
    </div>)}</div>
  </section>;
}
