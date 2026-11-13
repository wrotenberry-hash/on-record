"use client";
import { useState } from "react";

/** Editor-only: writes summaries now instead of waiting for the 19:00 UTC run. Same caps. */
export function GenerateNow({ disabledReason }: { disabledReason: string | null }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"), [note, setNote] = useState("");
  async function run() {
    setState("running"); setNote("Reading bill texts and writing summaries. This can take up to five minutes; keep this page open.");
    try {
      const res = await fetch("/api/editor/analysis/generate", { method: "POST" });
      const out = await res.json() as { status?: string; made?: Array<{ label: string; costUsd: number }>; stoppedBy?: string | null; error?: string };
      const made = out.made ?? [];
      const cost = made.reduce((n, m) => n + m.costUsd, 0);
      setNote(`${made.length ? `Wrote ${made.length} summar${made.length === 1 ? "y" : "ies"} for $${cost.toFixed(3)}.` : "No summary written."}${out.stoppedBy ? ` Stopped: ${out.stoppedBy}.` : ""}${out.error ? ` ${out.error}` : ""}`);
      setState(res.ok ? "done" : "error"); if (res.ok && made.length) setTimeout(() => window.location.reload(), 2500);
    } catch { setState("error"); setNote("The request could not finish. The scheduled run will continue where this stopped."); }
  }
  return <div className="update-now"><button type="button" onClick={() => void run()} disabled={state === "running" || !!disabledReason}>{state === "running" ? "Writing…" : "Write summaries now"}</button>
    {(note || disabledReason) && <small role="status">{note || disabledReason}</small>}</div>;
}
