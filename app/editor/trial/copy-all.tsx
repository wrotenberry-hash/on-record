"use client";
import { useState } from "react";

/** Copies a block of invite links in one tap. Falls back to selecting the text where the clipboard is refused. */
export function CopyAll({ text, inputId, rows }: { text: string; inputId: string; rows: number }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }
    catch { const el = document.getElementById(inputId) as HTMLTextAreaElement | null; el?.focus(); el?.select(); }
  }
  return <div className="invite-copy-all"><textarea id={inputId} readOnly value={text} rows={rows} aria-label="The new invite links" onFocus={e => e.currentTarget.select()} style={{ width: "100%", fontSize: 14 }} />
    <button type="button" onClick={() => void copy()} style={{ minHeight: 48 }}>{done ? "Copied" : "Copy all ten"}</button></div>;
}
