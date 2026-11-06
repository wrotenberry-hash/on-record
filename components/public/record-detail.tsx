import { ArrowUpRight } from "lucide-react";
import type { PublicRecord } from "@/lib/published-records";

/** The inspectable body of one published record. Server- or client-rendered; no data fetching. */
export function RecordDetail({ record: r, permalink }: { record: PublicRecord; permalink: string }) {
  return <>
    <div className="eyebrow">PUBLISHED RECORD · {r.status}</div>
    <h3>{r.proposition.issue || "Under review"}</h3>
    <small>{r.speakerName}</small>
    <hr/>
    <label>EXACT REPRESENTATION</label><blockquote>“{r.representation.exactText}”</blockquote>
    <label>PROPOSITION</label><p>{r.proposition.text}</p>
    <label>WHAT REMAINS TO CHECK</label><p>{r.adjudication.explanation}</p>
    <hr/>
    <label>SUPPORTING EVIDENCE SEARCH</label><p>{r.adjudication.supportingSearch}</p>
    <label>CONTRARY EVIDENCE SEARCH</label><p>{r.adjudication.contrarySearch}</p>
    <label>LINKS CITED IN THE RESEARCH</label>
    {r.evidence.length ? r.evidence.map(e => <div className="published-evidence" key={e.id}><b>{e.stance} · {e.title}</b><p>{e.excerpt}</p><small>{e.applicability}</small>{e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Source <ArrowUpRight size={14}/></a>}</div>)
      : <p>No applicable evidence attached; the record remains unresolved.</p>}
    <hr/>
    <label>PASSAGE FROM THE ORIGINAL COMMUNICATION</label>
    <p className="original-content">{r.source.passage}</p>
    {r.source.canonicalUrl && <a href={r.source.canonicalUrl} target="_blank" rel="noopener noreferrer">Open captured source <ArrowUpRight size={14}/></a>}
    <p className="detail-foot">Source capture recorded on {new Date(r.source.sourceVerification.recordedAt).toLocaleDateString()} ({r.source.sourceVerification.method}). Human review approved on {new Date(r.review.reviewedAt).toLocaleDateString()}. Published {new Date(r.publishedAt).toLocaleDateString()}.</p>
    <p className="permalink"><label>PERMANENT LINK</label><a href={permalink}>{permalink}</a></p>
  </>;
}
