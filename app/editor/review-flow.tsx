"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The review flow: one card per gate, mostly taps. Every card posts to the same
 * server gates as before (source-auth, representation, materiality, apply-draft,
 * adjudication, review, publish); nothing about the methodology moved, only the
 * amount of typing. Machine suggestions are shown and must be tapped to accept.
 */
export type Evidence = { id: string; propositionEvidenceId: string; title: string; sourceName: string; sourceUrl: string; excerpt: string; stance: "SUPPORTS" | "CONTRADICTS" | "CONTEXT"; applicability: string };
export type SearchLog = { id: string; side: "SUPPORTS" | "CONTRADICTS"; strategy: string; resultsSummary: string; searchedAt: number };
export type Case = { id: string; captureId: string; representationId: string; propositionId: string; speakerName: string; sourceType: string; canonicalUrl: string; originalContent: string; exactText: string; canonicalProposition: string; issue: string | null; status: string; stage: string; context?: string | null;
  sourceAuthentication: null | { verifiedAt: number; method: string }; materiality: null | { level: string; rationale: string; lockedAt: number }; searches: SearchLog[]; evidence: Evidence[];
  researchDraft: null | { status: string; error: string | null; supportingSummary: string | null; contrarySummary: string | null; citations: Array<{ url: string; title: string; side: string }> | null; assessment: null | { accuracyAnchor: string; contextIntegrity?: string; authority?: number; sufficiency?: number; directness?: number; temporalFit?: number; explanation: string } };
  assessment?: null | { accuracyAnchor: string; contextIntegrity: string; authority: number; sufficiency: number; directness: number; temporalFit: number; explanation: string };
  adjudication: null | { id: string; state: string; explanation: string }; review: null | { decision: string; notes: string }; publication: null | { id: string; publishedAt: number }; missingRequirements: string[] };

type Post = (path: string, payload: Record<string, unknown>, message: string) => Promise<boolean>;
type Props = { current: Case; busy: boolean; post: Post };

export const FLOW_STEPS = [["source", "Source"], ["judge", "Judge"], ["evidence", "Evidence"], ["finish", "Finish"]] as const;
export type FlowStep = typeof FLOW_STEPS[number][0] | "done" | "closed";

export function flowStep(c: Case): FlowStep {
  if (c.publication) return "done";
  if (c.status === "REJECTED" || c.materiality?.level === "M0") return "closed";
  if (!c.sourceAuthentication) return "source";
  if (c.status !== "APPROVED" || !c.materiality) return "judge";
  if (!c.adjudication) return "evidence";
  return "finish";
}

const normalize = (v: string) => v.replace(/\s+/g, " ").trim();
const MATERIALITY_LABEL: Record<string, string> = { M0: "M0 · not material", M1: "M1 · supporting", M2: "M2 · material", M3: "M3 · critical" };

/** The machine's pre-research suggestion lives in the representation's context text. */
export function machineSuggestion(context: string | null | undefined): { tier: "M0" | "M1" | "M2" | "M3"; rationale: string } | null {
  const m = context?.match(/materiality (M[0-3]): ([\s\S]*?)\.? Reviewer must/);
  return m ? { tier: m[1] as "M0" | "M1" | "M2" | "M3", rationale: m[2].trim() } : null;
}

/** A window of the preserved capture around the quote, with the quote marked. */
function QuoteWindow({ text, quote }: { text: string; quote: string }) {
  const at = text.indexOf(quote);
  if (at < 0) return <p className="quote-window"><em>The exact quote was not found verbatim in the preserved capture.</em></p>;
  const start = Math.max(0, at - 500), end = Math.min(text.length, at + quote.length + 500);
  return <p className="quote-window">{start > 0 && "… "}{text.slice(start, at)}<mark>{quote}</mark>{text.slice(at + quote.length, end)}{end < text.length && " …"}</p>;
}

export default function ReviewFlow({ current, busy, post }: Props) {
  const step = flowStep(current);
  const base = "/api/editor/cases/" + encodeURIComponent(current.id);
  return <div className="review-flow">
    <div className="flow-track">{FLOW_STEPS.map(([key, label], i) => <div key={key} className={step === key ? "now" : (FLOW_STEPS.findIndex(s => s[0] === step) > i || step === "done") ? "done" : ""}><span>{i + 1}</span>{label}</div>)}</div>
    {step === "source" && <SourceCard current={current} busy={busy} post={post} base={base} />}
    {step === "judge" && <JudgeCard current={current} busy={busy} post={post} base={base} />}
    {step === "evidence" && <EvidenceCard current={current} busy={busy} post={post} base={base} />}
    {step === "finish" && <FinishCard current={current} busy={busy} post={post} base={base} />}
    {step === "done" && <section className="review-card"><h3>Published as CHECKING</h3><p>Published {new Date(current.publication!.publishedAt).toLocaleString()}. It carries no rating. <Link href="/records">See the public record →</Link></p></section>}
    {step === "closed" && <section className="review-card"><h3>{current.status === "REJECTED" ? "Rejected" : "Not material"}</h3><p>{current.status === "REJECTED" ? (current.context || "The representation was rejected.") : `M0: ${current.materiality?.rationale}`}</p><p>This case is closed; nothing about it is public.</p></section>}
  </div>;
}

function SourceCard({ current, busy, post, base }: Props & { base: string }) {
  const [pasted, setPasted] = useState("");
  const automated = current.sourceType === "web" || current.sourceType.startsWith("discovered:");
  const matches = automated ? normalize(pasted).includes(normalize(current.exactText)) : pasted.trim().length > 0;
  return <section className="review-card">
    <h3>1. Check the source</h3>
    <p>Open the original, find this sentence, and paste it back. That is your attestation that the quote is real and in context. Nothing else to fill in.</p>
    <QuoteWindow text={current.originalContent} quote={current.exactText} />
    <a className="open-original" href={current.canonicalUrl} target="_blank" rel="noopener noreferrer">Open the original ↗</a>
    <label>{automated ? "Paste the sentence from the original that contains the quote" : "Paste the complete original text (manual capture)"}
      <Textarea rows={3} value={pasted} onChange={e => setPasted(e.target.value)} placeholder={automated ? "Copy from the original page, not from the box above." : "The full text, byte for byte."} /></label>
    {pasted && !matches && <p className="hint">The pasted text does not contain the exact quote yet.</p>}
    <div className="choice-row">
      <Button type="button" disabled={busy || !matches} onClick={() => void post(base + "/source-auth", { method: "original-page", reviewedUrl: current.canonicalUrl, reviewedContent: pasted,
        notes: "Reviewer opened the original in a browser and pasted the sentence containing the exact representation; the app verified the paste contains the quote." }, "Source checked and recorded.")}>Confirm the quote is in the original</Button>
      <details><summary>Something is wrong with this capture</summary><p>Use <b>Find stronger claims in this source</b> above to extract different sentences, or, if the quote is not in the original at all, confirm anyway with the passage you find and then reject it at the next step with a note. Rejections are kept, never published.</p></details>
    </div>
  </section>;
}

function JudgeCard({ current, busy, post, base }: Props & { base: string }) {
  const suggestion = useMemo(() => machineSuggestion(current.context), [current.context]);
  const [tier, setTier] = useState<"M0" | "M1" | "M2" | "M3" | null>(null);
  const [rationale, setRationale] = useState(suggestion?.rationale ?? "");
  const [rejectReason, setRejectReason] = useState("Not a substantive factual representation in context.");
  const [mode, setMode] = useState<"approve" | "reject">("approve");
  const approved = current.status === "APPROVED";
  async function approveAndLock() {
    if (!tier) return;
    if (!approved && !await post(base + "/representation", { decision: "APPROVED", notes: "Exact wording and context confirmed against the original." }, "Representation approved.")) return;
    if (!await post(base + "/materiality", { tier, rationale }, `Materiality locked at ${tier}.`)) return;
    if (tier !== "M0" && current.researchDraft?.status === "COMPLETE") await post(base + "/apply-draft", {}, "Machine research brought in as leads. Inspect each one next.");
  }
  return <section className="review-card">
    <h3>2. Judge it</h3>
    {!approved && <div className="choice-row">
      <Button type="button" className={mode === "approve" ? "on" : ""} onClick={() => setMode("approve")}>It is a factual claim, quoted correctly</Button>
      <Button type="button" className={mode === "reject" ? "on" : ""} onClick={() => setMode("reject")}>Reject it</Button>
    </div>}
    {mode === "reject" && !approved ? <>
      <label>Why<Textarea rows={2} value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></label>
      <Button type="button" disabled={busy || rejectReason.trim().length < 3} onClick={() => void post(base + "/representation", { decision: "REJECTED", notes: rejectReason.trim() }, "Rejected and closed.")}>Record rejection</Button>
    </> : <>
      <p>How much does this claim matter? {suggestion && <>The machine suggested <b>{suggestion.tier}</b>; tap to accept or choose another.</>}</p>
      <div className="tier-row">{(["M0", "M1", "M2", "M3"] as const).map(t => <Button key={t} type="button" className={tier === t ? "on" : ""} onClick={() => { setTier(t); if (!rationale && suggestion?.tier === t) setRationale(suggestion.rationale); }}>{MATERIALITY_LABEL[t]}</Button>)}</div>
      <label>Why this tier<Textarea rows={2} value={rationale} onChange={e => setRationale(e.target.value)} placeholder="One sentence is enough." /></label>
      <Button type="button" disabled={busy || !tier || rationale.trim().length < 10} onClick={() => void approveAndLock()}>{approved ? `Lock ${tier ?? "materiality"}` : `Approve and lock ${tier ?? "materiality"}`}</Button>
      {tier === "M0" && <p className="hint">M0 closes the case as not worth checking. It is kept, never published.</p>}
    </>}
  </section>;
}

function EvidenceCard({ current, busy, post, base }: Props & { base: string }) {
  const hasSearches = current.searches.some(x => x.side === "SUPPORTS") && current.searches.some(x => x.side === "CONTRADICTS");
  const draft = current.researchDraft;
  const [kept, setKept] = useState<string[]>([]);
  const [explanation, setExplanation] = useState((current.assessment?.explanation ?? draft?.assessment?.explanation ?? "").replace(/\s*\[Machine draft; human QA required\]\s*$/, ""));
  const [ownAssessment, setOwnAssessment] = useState(false);
  const a = current.assessment ?? null;
  const [acc, setAcc] = useState(a?.accuracyAnchor ?? "U"), [ctx, setCtx] = useState(a?.contextIntegrity ?? "N/A");
  const [conf, setConf] = useState({ authority: a?.authority ?? 0, sufficiency: a?.sufficiency ?? 0, directness: a?.directness ?? 0, temporalFit: a?.temporalFit ?? 0 });
  if (!hasSearches) return <section className="review-card">
    <h3>3. Evidence</h3>
    {draft?.status === "COMPLETE" ? <><p>The machine&apos;s supporting and contrary searches are ready. Bring them in as leads to inspect.</p>
      <Button type="button" disabled={busy} onClick={() => void post(base + "/apply-draft", {}, "Machine research brought in as leads.")}>Bring in the machine research</Button></>
      : <><p>No machine research yet{draft?.status === "FAILED" && draft.error ? ` (last attempt: ${draft.error})` : ""}. Run it now; it uses one of today&apos;s research attempts.</p>
      <Button type="button" disabled={busy || draft?.status === "PROCESSING"} onClick={() => void post(base + "/draft-research", {}, "Machine research saved.")}>{busy ? "Researching…" : "Run machine research"}</Button></>}
  </section>;
  const total = conf.authority + conf.sufficiency + conf.directness + conf.temporalFit;
  async function adjudicate() {
    if (ownAssessment && !await post(base + "/assessment", { accuracyAnchor: acc, contextIntegrity: ctx, ...conf, explanation: explanation.trim() }, "Your assessment saved.")) return;
    await post(base + "/adjudication", { state: "CHECKING", explanation: explanation.trim(), consideredEvidenceIds: kept }, "Recorded as CHECKING.");
  }
  return <section className="review-card">
    <h3>3. Evidence</h3>
    <p>Open each lead. Tick the ones that genuinely bear on the proposition; leave the rest. Then record what remains unresolved.</p>
    <details className="searches"><summary>What the searches found</summary>{current.searches.map(s => <div key={s.id}><b>{s.side === "SUPPORTS" ? "Supporting" : "Contrary"} search</b><p>{s.resultsSummary}</p></div>)}</details>
    <div className="checklist">{current.evidence.length ? current.evidence.map(e => <label key={e.propositionEvidenceId} className={kept.includes(e.propositionEvidenceId) ? "kept" : ""}>
      <input type="checkbox" checked={kept.includes(e.propositionEvidenceId)} onChange={ev => setKept(v => ev.target.checked ? [...v, e.propositionEvidenceId] : v.filter(id => id !== e.propositionEvidenceId))} />
      <span className={"stance " + e.stance.toLowerCase()}>{e.stance}</span>
      <span className="title">{e.title}<small>{e.sourceName}</small></span>
      {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()}>Open ↗</a>}
    </label>) : <p className="hint">No leads were cited. You can still record the case as unresolved.</p>}</div>
    <label>What remains unresolved<Textarea rows={3} value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="One or two sentences. Prefilled from the machine's assessment; edit freely." /></label>
    <details open={ownAssessment} onToggle={e => setOwnAssessment((e.target as HTMLDetailsElement).open)}><summary>Record my own assessment instead of the machine&apos;s proposal</summary>
      <div className="assess-grid">
        <label>Accuracy<select value={acc} onChange={e => setAcc(e.target.value)}>{["U", "100", "95", "85", "65", "35", "15", "0"].map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Context integrity<select value={ctx} onChange={e => setCtx(e.target.value)}>{["N/A", "100", "85", "60", "30", "0"].map(x => <option key={x}>{x}</option>)}</select></label>
        {(["authority", "sufficiency", "directness", "temporalFit"] as const).map(k => <label key={k}>{k} (0–25)<input type="number" min={0} max={25} value={conf[k]} onChange={e => setConf(c => ({ ...c, [k]: Math.max(0, Math.min(25, Number(e.target.value) || 0)) }))} /></label>)}
      </div><p className="hint">Evidence confidence {total}/100. {a && !ownAssessment ? `Machine proposal on file: accuracy ${a.accuracyAnchor}, context ${a.contextIntegrity}.` : ""}</p></details>
    <Button type="button" disabled={busy || explanation.trim().length < 10} onClick={() => void adjudicate()}>Record as CHECKING{kept.length ? ` with ${kept.length} lead${kept.length === 1 ? "" : "s"} considered` : ""}</Button>
  </section>;
}

function FinishCard({ current, busy, post, base }: Props & { base: string }) {
  const [decision, setDecision] = useState<"APPROVED" | "CHANGES_REQUESTED" | "REJECTED">("APPROVED");
  const [notes, setNotes] = useState("Opened the original and each considered source; attribution, context and dates hold.");
  const [checked, setChecked] = useState(false);
  if (!current.review || current.review.decision !== "APPROVED") return <section className="review-card">
    <h3>4. Finish</h3>
    {current.review && <p className="hint">Last review: {current.review.decision}. {current.review.notes}</p>}
    <p>Adjudicated as CHECKING: <em>{current.adjudication?.explanation}</em></p>
    <div className="choice-row">{([["APPROVED", "Approve the record"], ["CHANGES_REQUESTED", "Needs changes"], ["REJECTED", "Reject"]] as const).map(([k, l]) => <Button key={k} type="button" className={decision === k ? "on" : ""} onClick={() => setDecision(k)}>{l}</Button>)}</div>
    <label>Notes<Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <label className="attest"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> I opened the original and each source I ticked.</label>
    <Button type="button" disabled={busy || !checked || notes.trim().length < 3} onClick={() => void post(base + "/review", { decision, notes: notes.trim(), verifiedSource: true, verifiedEvidence: true }, "Review recorded.")}>Record review</Button>
  </section>;
  return <section className="review-card">
    <h3>4. Finish</h3>
    <p>Reviewed and approved. Publishing puts this on the public record as <b>CHECKING</b>, an open investigation with its sources, no rating. While public reading is switched off, nothing is visible to anyone else yet.</p>
    <div className="choice-row">
      <Button type="button" disabled={busy} onClick={() => void post(base + "/publish", {}, "Published as CHECKING.")}>Publish as CHECKING</Button>
      <span className="hint">Or leave it here; unpublished records stay private.</span>
    </div>
  </section>;
}
