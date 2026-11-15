"use client";
import { useState } from "react";

/** Copies one invite link. Falls back to selecting the text where the clipboard is refused. */
export function CopyLink({ url, inputId }: { url: string; inputId: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000); }
    catch { const el = document.getElementById(inputId) as HTMLInputElement | null; el?.focus(); el?.select(); }
  }
  return <div className="invite-copy"><input id={inputId} readOnly value={url} aria-label="Invite link" onFocus={e => e.currentTarget.select()} />
    <button type="button" onClick={() => void copy()}>{done ? "Copied" : "Copy"}</button></div>;
}
