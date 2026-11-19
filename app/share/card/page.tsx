import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { PublicShell } from "@/components/public/public-shell";
import { SharePanel } from "@/components/share/share-panel";
import { VideoMaker, type Scene } from "@/components/share/video-maker";
import { ReportProblem } from "@/components/share/report-problem";
import { StanceSwitch } from "@/components/share/stance-switch";
import { VoteBox } from "@/components/voice/vote-box";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { resolveShare, retiredShare, type Resolved } from "@/lib/share-resolve";
import { captionWith, countShareStart, shortLinkFor, SITE } from "@/lib/share";
import { asStance, STANCE_LINE, type Stance } from "@/lib/card-content";
import { billPagePath, cardTarget } from "@/lib/entry/rules";
import { billLevel, cardStance, ownAnswer } from "@/lib/entry/store";
import { billIdentity } from "@/lib/entry/cards";
import { voteBoxData } from "@/lib/constituent/view";
import { previewMeta } from "@/lib/seo";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: BRAND.name };
  const sp = await searchParams, r = await resolveShare(sp.t, sp);
  if (!r) return { title: brandTitle(retiredShare(sp.t, sp) ? "This card is no longer made" : "Not found") };
  // A stance reaches the preview only when a reader put it on this exact card (the share record says so).
  const stance = r.card && asStance(sp.stance) ? await cardStance(getDb(), { userId: null, billKey: r.billKey, requested: sp.stance, targetWithStance: cardTarget(`${r.query}&stance=${sp.stance}`) }).catch(() => null) : null;
  const query = stance ? `${r.query}&stance=${stance}` : r.query;
  const image = r.slides ? `/api/cards/g?${r.query}&n=1` : `/api/cards/g?${query}&format=link`;
  return { title: brandTitle(r.title), description: r.caption.slice(0, 200), robots: { index: false, follow: true }, ...previewMeta(SITE, `/share/card?${query}`, r.title, r.caption.slice(0, 200), image) };
}

/** Where the card's fact comes from, in the words of its own badge. */
function builtFrom(r: Resolved): string {
  const labels = new Set(r.card ? r.card.lines.map(l => l.describe.label) : r.slides!.map(s => s.badge));
  if (labels.has("Readers")) return r.type === "total" ? `built from ${BRAND.name}'s anonymous totals of counted residents (labelled Readers)` : "built from the reader's own answers and official records (labelled Readers)";
  return `built only from official records${labels.has("Analysis") ? ` and reviewed ${BRAND.name} summaries (labelled Analysis)` : ""}`;
}

const ctype = (l: string) => `ctype ctype-${l === "Readers" ? "opinion" : l.toLowerCase()}`;

/** The video's scenes come from the same record data as the card: nothing new is written for it, and it never carries a reader's answer. */
function scenesOf(r: Resolved): Scene[] {
  if (r.slides) return r.slides.map(s => ({ eyebrow: s.eyebrow, heading: s.heading, badge: s.badge, points: s.points, foot: `${s.date} · Source: ${s.source}` }));
  const c = r.card!;
  return [{ eyebrow: c.eyebrow, heading: c.title, points: c.subtitle ? [c.subtitle] : [] },
    ...c.lines.map(l => ({ eyebrow: `${l.date} · ${l.kindLabel.toUpperCase()}`, heading: l.vote, badge: l.describe.label, points: [l.what, l.describe.text], foot: `Source: ${l.source}` })),
    ...(c.note ? [{ eyebrow: c.eyebrow, heading: "How to read this", points: [c.note] }] : [])];
}

/**
 * Round G: share any card. The page a shared link lands on, so it shows the card,
 * the same facts as text, links to the exact items, and an invitation to look up
 * your own legislators.
 *
 * 18 Nov 2026 (owner's point 10): one sourced fact per card, and the reader's own answer if they choose. The switch
 * "Add my answer to the card" is off until the reader turns it on (`mine=1`). The line comes from the reader's own
 * answer on that bill, read here on the server; a reader who has not answered is offered the vote box first. The only
 * thing kept is the share record of the card with that line (share_links), which does not say who made it.
 */
export default async function ShareCardPage({ searchParams }: { searchParams: Search }) {
  const access = await viewerAccess();
  const sp = await searchParams;
  if (!access.allowed) return <PublicShell current="/politicians" access={access} page="/share/card">{null}</PublicShell>;
  const retired = retiredShare(sp.t, sp);
  if (retired) return <PublicShell current="/politicians" access={access} page="/share/card">
    <section className="fed-page"><div className="eyebrow">SHARE · FROM THE RECORD</div><h1>This card is no longer made</h1>
      <p className="lede">{retired}</p><p><Link className="button-link" href="/dashboard">Open the dashboard</Link></p></section></PublicShell>;
  const r = await resolveShare(sp.t, sp);
  if (!r) notFound();
  const db = getDb(), fromShare = sp.from === "share", canAnswer = !!access.invite || !!access.editor;
  if (sp.src === "bill" && !fromShare) await countShareStart(r.type);

  // The reader's stance. Only on a card about one bill; only the reader's own answer, or one already on this exact card.
  const stanceable = !!r.card && !!r.billKey, userId = canAnswer && stanceable ? await currentAppUserId().catch(() => null) : null;
  const wantMine = stanceable && canAnswer && sp.mine === "1", asked = stanceable && !wantMine ? asStance(sp.stance) : null;
  // Off by default: the reader's own answer goes on only when they switched it on here. A stance that arrives in the
  // address is someone else's card: it is shown as shared (if a reader really made it) and is never offered as yours.
  const own = wantMine ? await ownAnswer(db, userId, r.billKey).catch(() => null) : null;
  const theirs: Stance | null = asked ? await cardStance(db, { userId: null, billKey: r.billKey, requested: asked, targetWithStance: cardTarget(`${r.query}&stance=${asked}`) }).catch(() => null) : null;
  const mine: Stance | null = own;
  const stance = mine ?? theirs, query = stance ? `${r.query}&stance=${stance}` : r.query;
  const path = `/share/card?${query}`, link = theirs ? null : await shortLinkFor(path, r.type), caption = captionWith(r.caption, link ?? `${SITE}${path}`);
  const needAnswer = wantMine && !own;
  const bill = needAnswer ? await billIdentity(db, r.billKey!).catch(() => null) : null, level = bill ? await billLevel(db, bill.key).catch(() => null) : null;
  const voice = needAnswer && bill ? await voteBoxData(bill.key, access).catch(() => null) : null;

  return <PublicShell current="/politicians" access={access} page="/share/card">
    <section className="fed-page">
      {fromShare && <div className="share-landing"><p><strong>Someone shared this from the official record.</strong> Every figure links to its source.</p>
        <Link className="button-link" href="/start">See your own legislators →</Link></div>}
      <div className="eyebrow">SHARE · FROM THE RECORD</div>
      <h1>{r.title}</h1>
      <p className="meta">{r.slides ? "Each slide carries one fact" : "This card carries one fact"}, with its date and its source, {builtFrom(r)}. Your caption goes beside the image, never on it.</p>

      {theirs ? <>
        {/* Someone else's card with their answer on it: shown as it was shared, and never offered for sharing as your own. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/cards/g?${query}&format=feed`} alt={`Share card: ${r.card!.lines[0].vote}. Added by the person sharing: ${STANCE_LINE[theirs]}`} className="share-preview share-feed" />
        <p className="gate gate-closed" role="note">The person who shared this card added the line “{STANCE_LINE[theirs]}” It is their own answer. It is not part of the record.</p>
        <p><Link className="button-link" href={`/share/card?${r.query}`}>Share this fact yourself</Link></p>
      </> : <>
        {stanceable && canAnswer && <StanceSwitch on={!!mine} href={mine ? `/share/card?${r.query}` : `/share/card?${r.query}&mine=1`} line={mine ? STANCE_LINE[mine] : null} />}
        {needAnswer && <div className="gate gate-closed" role="status"><p>You have not answered on this bill yet. Answer below, and your answer can go on the card.</p></div>}
        {needAnswer && voice && bill && <VoteBox billKey={bill.key} question={`Do you support ${bill.label}?`} plain={false} officialTitle={bill.title} data={voice} back={billPagePath(bill.key, level ?? "federal")} />}
        <SharePanel key={query} imageBase={`/api/cards/g?${query}`} filename={`${BRAND.fileSlug}-${r.type}`} defaultCaption={caption} kind={r.type} link={link} slides={r.slides?.length ?? 0} />
        <h2>Make a short video</h2>
        <VideoMaker scenes={scenesOf(r)} filename={`${BRAND.fileSlug}-${r.type}`} caption={caption} kind={r.type} />
      </>}

      <h2>The same {r.slides ? "facts" : "fact"}, as text</h2>
      {r.card ? <ul className="analysis-list">{r.card.lines.map((l, i) => <li key={i}><strong>{l.vote}</strong> — {l.what}. <span className={ctype(l.describe.label)}>{l.describe.label}</span> {l.describe.text} ({l.date}; source: {l.source})</li>)}
        {r.card.note && <li>{r.card.note}</li>}
        {stance && <li className="stance-text">Added by the person sharing this card, and not part of the record: {STANCE_LINE[stance]}</li>}</ul>
        : <ol className="analysis-list">{r.slides!.map(s => <li key={s.index}><strong>{s.heading}</strong> <span className={ctype(s.badge)}>{s.badge}</span><ul>{s.points.map((p, j) => <li key={j}>{p} ({s.date}; source: {s.source})</li>)}</ul></li>)}</ol>}
      <p className="meta">{r.links.map((l, i) => <span key={l.href}>{i ? " · " : ""}<Link href={l.href}>{l.label}</Link></span>)}{r.links.length ? " · " : ""}<Link href="/start">See your own legislators</Link> · <Link href="/method">How this is made</Link></p>
      {!theirs && (r.type === "vote" || r.type === "bill") && <details className="method"><summary>Embed this card on another site</summary>
        <p className="meta">Works once {BRAND.name} is public; until then the embed shows nothing.</p>
        <pre className="embed-code">{`<iframe src="${SITE}/embed/${r.type}?${r.query.replace(/^t=[a-z]+&/, "")}" width="420" height="380" style="border:0" title="${BRAND.name} card" loading="lazy"></iframe>`}</pre></details>}
      <ReportProblem subjectKind={r.type} subjectRef={r.query} page={`/share/card?${r.query}`} status={sp.reported} />
    </section>
  </PublicShell>;
}
