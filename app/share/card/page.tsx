import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { SharePanel } from "@/components/share/share-panel";
import { VideoMaker, type Scene } from "@/components/share/video-maker";
import { ReportProblem } from "@/components/share/report-problem";
import { viewerAccess } from "@/lib/viewer";
import { resolveShare, type Resolved } from "@/lib/share-resolve";
import { captionWith, shortLinkFor, SITE } from "@/lib/share";
import { previewMeta } from "@/lib/seo";
import { BRAND, brandTitle } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Search = Promise<Record<string, string | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  if (!(await viewerAccess()).allowed) return { title: BRAND.name };
  const r = await resolveShare((await searchParams).t, await searchParams);
  if (!r) return { title: brandTitle("Not found") };
  const image = r.slides ? `/api/cards/g?${r.query}&n=1` : `/api/cards/g?${r.query}&format=link`;
  return { title: brandTitle(r.title), description: r.caption.slice(0, 200), robots: { index: false, follow: true }, ...previewMeta(SITE, `/share/card?${r.query}`, r.title, r.caption.slice(0, 200), image) };
}

const ctype = (l: string) => `ctype ctype-${l === "Readers" ? "opinion" : l.toLowerCase()}`;

/** The video's scenes come from the same record data as the card: nothing new is written for it. */
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
 */
export default async function ShareCardPage({ searchParams }: { searchParams: Search }) {
  const access = await viewerAccess();
  const sp = await searchParams;
  if (!access.allowed) return <PublicShell current="/politicians" access={access} page="/share/card">{null}</PublicShell>;
  const r = await resolveShare(sp.t, sp);
  if (!r) notFound();
  const path = `/share/card?${r.query}`, link = await shortLinkFor(path, r.type), caption = captionWith(r.caption, link ?? `${SITE}${path}`);
  const fromShare = sp.from === "share";
  return <PublicShell current="/politicians" access={access} page="/share/card">
    <section className="fed-page">
      {fromShare && <div className="share-landing"><p><strong>Someone shared this from the official record.</strong> Every figure links to its source.</p>
        <Link className="button-link" href="/start">See your own legislators →</Link></div>}
      <div className="eyebrow">SHARE · FROM THE RECORD</div>
      <h1>{r.title}</h1>
      <p className="meta">Built only from official records{r.officialOnly ? "" : ` and reviewed ${BRAND.name} summaries (labelled Analysis)`}. Every card shows its badges, the date, the source and our footer. Your caption goes beside the image, never on it.</p>
      <SharePanel imageBase={`/api/cards/g?${r.query}`} filename={`${BRAND.fileSlug}-${r.type}`} defaultCaption={caption} kind={r.type} link={link} slides={r.slides?.length ?? 0} />
      <h2>Make a short video</h2>
      <VideoMaker scenes={scenesOf(r)} filename={`${BRAND.fileSlug}-${r.type}`} caption={caption} kind={r.type} />
      <h2>The same facts, as text</h2>
      {r.card ? <ul className="analysis-list">{r.card.lines.map((l, i) => <li key={i}><strong>{l.vote}</strong> — {l.what}. <span className={ctype(l.describe.label)}>{l.describe.label}</span> {l.describe.text} ({l.date}; source: {l.source})</li>)}
        {r.card.note && <li>{r.card.note}</li>}</ul>
        : <ol className="analysis-list">{r.slides!.map(s => <li key={s.index}><strong>{s.heading}</strong> <span className={ctype(s.badge)}>{s.badge}</span><ul>{s.points.map((p, j) => <li key={j}>{p}</li>)}</ul></li>)}</ol>}
      <p className="meta">{r.links.map((l, i) => <span key={l.href}>{i ? " · " : ""}<Link href={l.href}>{l.label}</Link></span>)}{r.links.length ? " · " : ""}<Link href="/start">See your own legislators</Link> · <Link href="/method">How this is made</Link></p>
      {(r.type === "vote" || r.type === "bill") && <details className="method"><summary>Embed this card on another site</summary>
        <p className="meta">Works once {BRAND.name} is public; until then the embed shows nothing.</p>
        <pre className="embed-code">{`<iframe src="${SITE}/embed/${r.type}?${r.query.replace(/^t=[a-z]+&/, "")}" width="420" height="380" style="border:0" title="${BRAND.name} card" loading="lazy"></iframe>`}</pre></details>}
      <ReportProblem subjectKind={r.type} subjectRef={r.query} page={path} status={sp.reported} />
    </section>
  </PublicShell>;
}
