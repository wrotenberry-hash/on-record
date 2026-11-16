"use client";
import { useState } from "react";

const FORMATS = [{ id: "story", label: "Story (9:16)" }, { id: "feed", label: "Feed post (4:5)" }, { id: "link", label: "Link preview" }] as const;

/**
 * Pick a size, add your own caption (kept beside the image, never drawn on it),
 * then share through the phone's share sheet or save the image. Nothing is posted
 * by On Record.
 */
export function SharePanel({ imageBase, filename, defaultCaption }: { imageBase: string; filename: string; defaultCaption: string }) {
  const [format, setFormat] = useState<"story" | "feed" | "link">("story");
  const [caption, setCaption] = useState(defaultCaption);
  const [note, setNote] = useState("");
  const src = `${imageBase}&format=${format}`;
  async function share() {
    setNote("");
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], `${filename}-${format}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text: caption }); return; }
      setNote("This browser cannot share images directly. Save the image, then post it with your caption.");
    } catch (error) { if ((error as Error)?.name !== "AbortError") setNote("Sharing did not work here. Save the image instead."); }
  }
  return <div className="share-panel">
    <div className="share-formats" role="radiogroup" aria-label="Image size">{FORMATS.map(f => <button key={f.id} type="button" role="radio" aria-checked={format === f.id}
      className={format === f.id ? "on" : ""} onClick={() => setFormat(f.id)}>{f.label}</button>)}</div>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt="Share card preview" className={`share-preview share-${format}`} />
    <label className="share-caption" htmlFor="share-caption">Your caption (yours, not on the image)
      <textarea id="share-caption" value={caption} onChange={e => setCaption(e.target.value.slice(0, 500))} rows={3} /></label>
    <div className="share-actions"><button type="button" onClick={() => void share()}>Share</button>
      <a className="secondary-link" href={src} download={`${filename}-${format}.png`}>Save image</a></div>
    {note && <p className="meta" role="status">{note}</p>}
  </div>;
}
