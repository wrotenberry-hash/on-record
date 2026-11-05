import { PublicShell } from "@/components/public/public-shell";

export const dynamic = "force-dynamic";

export default function MethodPage() {
  return <PublicShell current="/method">
    <article className="prose">
      <div className="eyebrow">HOW A CLAIM IS CHECKED</div>
      <h1>Six steps, every one of them visible on the record.</h1>
      <p className="lede">A record on On Record is not a verdict. It is a chain you can follow from a person&apos;s own words to the evidence a human reviewer found for and against them, with the open question stated plainly.</p>

      <h2>1. The original is captured</h2>
      <p>We start from the communication itself: an official statement, a speech, an interview, a post. The page is captured as published, with its address, its publication time and the time we captured it. If the original is later edited or removed, that is recorded as a new observation. We do not guess at motive.</p>

      <h2>2. The exact words are kept</h2>
      <p>A representation is the sentence the person actually said or wrote, quoted verbatim and shown inside the passage it came from. A reviewer opens the original, finds the sentence, and attests that it is there and in context before anything else happens. If the quote cannot be found in the original, the case stops.</p>

      <h2>3. The claim is written out plainly</h2>
      <p>Beside the quote sits a proposition: the factual claim in neutral words, with its time, place and scope spelled out. Two people making the same claim in different words share one proposition, so the same evidence applies to both. Different claims stay separate, even when they sound alike.</p>

      <h2>4. Materiality is decided before any evidence is read</h2>
      <p>A reviewer decides how much the claim matters, from M0 (not material, never published) to M3 (critical), and writes down why. That decision is locked before the evidence search begins, so the weight of a claim cannot be adjusted to fit what the evidence turned out to say. Changing a locked decision requires a visible, logged revision.</p>

      <h2>5. Evidence is searched for in both directions</h2>
      <p>Every record documents a search for supporting evidence and a search for contrary evidence. Machine research may propose leads, but each lead is marked as unverified until a human has opened it and judged whether it bears on this exact proposition. Evidence about a related question is not treated as an answer to a more precise one.</p>

      <h2>6. A human reviews, then publishes as CHECKING</h2>
      <p>The reviewer records what the evidence shows and what remains unresolved, attests that they opened the original and each source they relied on, and publishes. Every record on this site carries the status CHECKING: it tells you what is being examined and what has been found so far. It does not assign a number.</p>

      <h2>What we do not do</h2>
      <ul>
        <li>No accuracy percentages, grades or truthfulness scores, for a claim or for a person. Those stay off until a published methodology for coverage and sufficiency exists and has been met.</li>
        <li>No different standard by party or by popularity. The same capture, extraction, materiality and evidence rules apply to everyone; where practical, the proposition is reviewed without the speaker&apos;s name.</li>
        <li>No silent edits. Publications and corrections preserve prior versions.</li>
        <li>No machine verdicts. Automation captures sources and proposes leads. Every gate between a captured sentence and a published record is passed by a person.</li>
      </ul>
      <p className="fine">The full methodology, decision log and scoring instrument are kept in the project repository and versioned with each record.</p>
    </article>
  </PublicShell>;
}
