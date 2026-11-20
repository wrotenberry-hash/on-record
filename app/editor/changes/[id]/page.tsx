import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireEditorUser } from "@/lib/auth";
import { brandTitle } from "@/lib/brand";
import { AnalysisBadge, shortDate } from "@/components/federal/badges";
import { menuDetail } from "@/lib/changes/queue-store";
import { approvedProblems, checkLine, groupProblems, groupTitle, highlightQuote, MENU_STATUS_WORD, NOT_YET_SHOWN, optionWord, sectionHref, sectionTitle, STATUS_WORD, windowWords,
  type OptionGroup } from "@/lib/changes/queue-rules";
import { SOURCE_LABEL } from "@/lib/changes/types";
import { closeMenu, decideGroup, decideOption, makeLive } from "../actions";
import { billName, EditorTop, ReadersSeeNothing } from "../parts";

export const dynamic = "force-dynamic";
export const metadata = { title: brandTitle("Menu of changes"), robots: { index: false, follow: false } };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A highlight that starts this far into a section gets a link to it, because the text scrolls inside its box. */
const FAR = 500;

/** A stored section exactly as published, with the quoted words marked where they are found. Nothing is changed or cut. */
function SectionText({ body, quote, markId, label }: { body: string; quote: string; markId: string; label: string }) {
  const h = highlightQuote(body, quote);
  return <>
    {h && h.before.length > FAR && <p className="meta change-links"><a href={`#${markId}`}>Go to the marked words</a></p>}
    <div className="change-text" tabIndex={0} role="region" aria-label={label}>{h ? <>{h.before}<mark id={markId}>{h.match}</mark>{h.after}</> : body}</div>
  </>;
}

/**
 * One drafted menu, for the editor to read: each group of options beside the section of bill text it quotes, with the
 * quoted words marked. Options are approved or rejected as drafted; wording is not rewritten here.
 */
export default async function ChangeMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireEditorUser(`/editor/changes/${encodeURIComponent(id)}`);
  const detail = /^[\w:.-]{1,120}$/.test(id) ? await menuDetail(getDb(), id) : null;
  if (!detail) notFound();
  const { menu, bill, versionLabel, groups, counts, live } = detail;
  const open = menu.status === "review", name = billName(bill);
  const flagged = groups.filter(g => groupProblems(g).length > 0).length;

  const card = (g: OptionGroup, n: number) => {
    const problems = groupProblems(g), blocking = approvedProblems(g), title = sectionTitle(g.sectionNum, g.section?.heading);
    const thisLabel = g.section?.versionLabel ?? `Version ${g.sectionVersion}`, otherLabel = g.other?.versionLabel ?? "The other version";
    const difference = g.source === "version" && !!g.otherQuote, decidable = g.options.filter(o => o.status !== "retired").length;
    return <li key={g.key} id={`g-${n}`} className="review-item change-group">
      <div className="eyebrow">{SOURCE_LABEL[g.source]}</div>
      <h3>{groupTitle(g)}</h3>
      <p className="meta">Source: {g.sourceLabel}</p>
      {problems.length > 0 && <div className="held-note" role="note"><b>Check before you approve.</b><ul className="analysis-list">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
      {blocking.length > 0 && <div className="held-note" role="note"><b>This stops the menu from being approved.</b><ul className="analysis-list">{blocking.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}

      <h4>{title} · {thisLabel}</h4>
      <p className="meta change-links"><Link href={sectionHref(bill.system, bill.key, g.sectionVersion, g.sectionNum)}>This section on the site</Link>
        {g.section && <a href={g.section.sourceUrl} rel="noreferrer">Official file</a>}</p>
      <div className={difference ? "change-quotes two" : "change-quotes"}>
        <figure className="change-quote"><figcaption>{difference ? thisLabel : "The quoted words"}</figcaption><blockquote>{g.quote}</blockquote></figure>
        {difference && <figure className="change-quote"><figcaption>{otherLabel}</figcaption><blockquote>{g.otherQuote}</blockquote></figure>}
      </div>
      {g.section ? <SectionText body={g.section.body} quote={g.quote} markId={`q-${n}`} label={`Text of ${title}, ${thisLabel}`} />
        : <p className="meta">The text of this section is not stored, so it cannot be shown here.</p>}
      {difference && g.other && <details className="primer"><summary>The same section in {g.other.versionLabel}</summary>
        <p className="meta change-links"><Link href={sectionHref(bill.system, bill.key, g.other.version, g.other.num)}>This section on the site</Link><a href={g.other.sourceUrl} rel="noreferrer">Official file</a></p>
        <SectionText body={g.other.body} quote={g.otherQuote ?? ""} markId={`q-${n}-other`} label={`Text of ${sectionTitle(g.other.num, g.other.heading)}, ${g.other.versionLabel}`} />
      </details>}

      <h4>What a reader would choose from</h4>
      <ul className="change-options">{g.options.map(o => { const word = optionWord(g, o); return <li key={o.id}>
        <p className="change-word"><b>{word}</b> <span className={`change-status is-${o.status}`}>{STATUS_WORD[o.status]}</span></p>
        <p className="change-wording">{o.wording}</p>
        <p className="meta">{checkLine(o.checks)}</p>
        {o.editorNote && <p className="meta">Your note: {o.editorNote}</p>}
        {open && o.status !== "retired" && <form action={decideOption} className="review-actions">
          <input type="hidden" name="optionId" value={o.id} />
          <input name="note" placeholder="Note if you reject (optional)" maxLength={500} aria-label={`Note on ${word} (optional)`} />
          <button name="decision" value="approved" aria-label={`Approve ${word}`}>Approve</button>
          <button name="decision" value="rejected" className="secondary" aria-label={`Reject ${word}`}>Reject</button>
        </form>}
      </li>; })}</ul>
      {open && decidable > 1 && <form action={decideGroup} className="review-actions change-all">
        <input type="hidden" name="menuId" value={menu.id} /><input type="hidden" name="groupKey" value={g.key} />
        <span className="meta">All {decidable} options in this group:</span>
        <button name="decision" value="approved" aria-label={`Approve all ${decidable} options: ${groupTitle(g)}`}>Approve all</button>
        <button name="decision" value="rejected" className="secondary" aria-label={`Reject all ${decidable} options: ${groupTitle(g)}`}>Reject all</button>
      </form>}
    </li>;
  };

  return <>
    <EditorTop />
    <main className="fed-page analysis-admin change-queue">
      <p className="crumbs"><Link href="/editor/changes">← Menus of changes</Link></p>
      <div className="eyebrow">EDITOR · MENU OF CHANGES <AnalysisBadge title="Drafted by AI from the bill's own text and the official record, checked by rules, and read by an editor" /></div>
      <h1>Changes offered on {name}</h1>
      <p className="lede"><Link href={bill.href}>{bill.title ?? "This bill is not on file."}</Link></p>
      <ReadersSeeNothing />
      <p className="meta">Status: {MENU_STATUS_WORD[menu.status]} · Text version: {versionLabel ?? menu.version} · Where the bill stood when this was drafted: {windowWords(menu.windowAtDraft)} · Drafted {shortDate(menu.createdAt)}{menu.model ? ` by ${menu.model}` : ""} · Cost ${menu.costUsd.toFixed(2)}</p>
      <p>Each card below is one number, date, limit, difference or amendment. It shows where the option comes from, the section of the bill it would change with the quoted words marked, and the options as a reader would see them: a short word and one sentence. When choosing opens in the next phase, a reader&apos;s choice will be recorded.</p>
      <p>Approve or reject each option as it is written. Wording is not edited here: reject an option and it is drafted again later. Both directions always go together, so an option cannot be approved while its opposite is rejected.</p>
      <p className="meta">{plural(groups.length, "group", "groups")} · {plural(counts.draft, "option waits", "options wait")} for you · {counts.approved} approved · {counts.rejected} rejected{flagged ? ` · ${plural(flagged, "group has", "groups have")} something to check, marked below` : ""}</p>

      <h2>What could not be offered</h2>
      {menu.notes.length ? <ul className="analysis-list">{menu.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p className="meta">The draft left no notes.</p>}

      <h2>The options, group by group ({groups.length})</h2>
      {groups.length ? <ul className="review-list">{groups.map((g, i) => card(g, i + 1))}</ul> : <p className="meta">This menu has no options.</p>}

      <h2 id="approve">Approve this menu</h2>
      {menu.status === "review" && live.ok && <>
        <p>{plural(counts.approved, "option is", "options are")} approved{counts.draft ? `, and ${plural(counts.draft, "option still waits", "options still wait")}` : ""}. Only approved options are on the menu. {NOT_YET_SHOWN}</p>
        <form action={makeLive} className="review-actions"><input type="hidden" name="menuId" value={menu.id} /><button>Approve this menu</button></form>
      </>}
      {menu.status === "review" && !live.ok && <div className="held-note" role="note"><b>This menu cannot be approved yet.</b><ul className="analysis-list">{live.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      {menu.status === "live" && <p>You approved this menu{menu.decidedAt ? ` on ${shortDate(menu.decidedAt)}` : ""}. {NOT_YET_SHOWN} Its options can no longer be changed here; it can only be closed.</p>}
      {menu.status === "closed" && <p>This menu is closed{menu.decidedAt ? ` (${shortDate(menu.decidedAt)})` : ""}. Nothing was deleted.</p>}
      {menu.status === "failed" && <p>Drafting did not finish, so there is nothing to approve. The notes above say why.</p>}
      {(menu.status === "review" || menu.status === "live") && <details className="primer"><summary>Close this menu without using it</summary>
        <p>Closing sets the whole menu aside. Nothing is deleted. A closed menu cannot be opened again from this screen.</p>
        <form action={closeMenu} className="review-actions"><input type="hidden" name="menuId" value={menu.id} /><button className="secondary">Close this menu</button></form>
      </details>}
    </main>
  </>;
}
