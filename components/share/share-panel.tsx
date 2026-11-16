"use client";
import { useState } from "react";

const FORMATS = [{ id: "story", label: "Story (9:16)" }, { id: "feed", label: "Feed post (4:5)" }, { id: "link", label: "Link preview" }] as const;
type Format = (typeof FORMATS)[number]["id"];

/** Aggregate share counting (no reader identity). Never blocks the share itself. */
export function logShare(event: string, kind: string) {
  try { void fetch("/api/share/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, kind }), keepalive: true }); } catch { /* ignore */ }
}

/**
 * Share one card (or a 5-slide carousel). The image is built from the record only;
 * the caption, which the reader may edit, travels beside it and is never drawn on
 * it. One tap: the phone's share sheet, save the image, or copy the caption with
 * the link to the exact item. Nothing is posted by On Record.
 */
export function SharePanel({ imageBase, filename, defaultCaption, kind = "card", link, slides = 0 }:
  { imageBase: string; filename: string; defaultCaption: string; kind?: string; link?: string | null; slides?: number }) {
  const [format, setFormat] = useState<Format>("story");
  const [caption, setCaption] = useState(defaultCaption);
  const [note, setNote] = useState("");
  const sep = imageBase.includes("?") ? "&" : "?";
  const srcs = slides ? Array.from({ length: slides }, (_, i) => `${imageBase}${sep}n=${i + 1}`) : [`${imageBase}${sep}format=${format}`];
  const names = slides ? srcs.map((_, i) => `${filename}-${i + 1}-of-${slides}.png`) : [`${filename}-${format}.png`];
  async function share() {
    setNote("");
    try {
      const files = await Promise.all(srcs.map(async (s, i) => new File([await (await fetch(s)).blob()], names[i], { type: "image/png" })));
      if (navigator.canShare?.({ files })) { await navigator.share({ files, text: caption }); logShare(slides ? "share_carousel" : "share_native", kind); return; }
      if (navigator.share && link) { await navigator.share({ text: caption, url: link }); logShare("share_native", kind); return; }
      setNote("This browser cannot share images directly. Save the image, then post it with the copied caption.");
    } catch (error) { if ((error as Error)?.name !== "AbortError") setNote("Sharing did not work here. Save the image instead."); }
  }
  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setNote(`${what} copied.`); logShare("share_copy", kind); }
    catch { setNote("Copying is blocked here. Press and hold the text to copy it."); }
  }
  const saves = srcs.map((s, i) => <a key={s} className="secondary-link" href={s} download={names[i]} onClick={() => logShare("share_download", kind)}>{slides ? `Save slide ${i + 1}` : "Save image"}</a>);
  return <div className="share-panel">
    {!slides && <div className="share-formats" role="radiogroup" aria-label="Image size">{FORMATS.map(f => <button key={f.id} type="button" role="radio" aria-checked={format === f.id}
      className={format === f.id ? "on" : ""} onClick={() => setFormat(f.id)}>{f.label}</button>)}</div>}
    <div className={slides ? "share-slides" : ""} {...(slides ? { tabIndex: 0, role: "region", "aria-label": "The 5 slides; scroll sideways" } : {})}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {srcs.map((s, i) => <img key={s} src={s} alt={slides ? `Slide ${i + 1} of ${slides}` : "Share card preview"} className={`share-preview share-${slides ? "feed" : format}`} loading={i ? "lazy" : "eager"} />)}
    </div>
    <label className="share-caption" htmlFor="share-caption">Caption (goes beside the image, never on it)
      <textarea id="share-caption" value={caption} onChange={e => setCaption(e.target.value.slice(0, 600))} rows={4} /></label>
    <div className="share-actions">
      <button type="button" onClick={() => void share()}>{slides ? "Share all 5 slides" : "Share"}</button>
      <button type="button" className="secondary-button" onClick={() => void copy(caption, "Caption and link")}>Copy caption + link</button>
      {link && <button type="button" className="link-button" onClick={() => void copy(link, "Link")}>Copy link</button>}
    </div>
    <p className="meta share-saves">{saves}</p>
    {note && <p className="meta" role="status">{note}</p>}
  </div>;
}
