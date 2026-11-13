"use client";
import { useState } from "react";

/** Editor-only: runs the federal update now instead of waiting for the next scheduled run. */
export function UpdateNow() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"), [note, setNote] = useState("");
  async function run() {
    setState("running"); setNote("Fetching the latest House and Senate votes. This can take up to two minutes.");
    try {
      const res = await fetch("/api/editor/federal-ingest", { method: "POST" });
      const out = await res.json() as { status?: string; steps?: Record<string, { stored?: number; ok?: boolean; error?: string }>; error?: string };
      const s = out.steps ?? {};
      setNote(`${out.status === "COMPLETE" ? "Up to date." : out.status === "PARTIAL" ? "Partly updated." : "Update failed."} Senate votes added: ${s.senate?.stored ?? 0}. House votes added: ${s.house?.stored ?? 0}.${Object.values(s).find(x => x.ok === false)?.error ? ` ${Object.values(s).find(x => x.ok === false)?.error}` : ""}`);
      setState(res.ok ? "done" : "error"); if (res.ok) setTimeout(() => window.location.reload(), 1500);
    } catch { setState("error"); setNote("The update could not be reached. Try again in a minute."); }
  }
  return <div className="update-now"><button type="button" onClick={() => void run()} disabled={state === "running"}>{state === "running" ? "Updating…" : "Update now"}</button>{note && <small role="status">{note}</small>}</div>;
}
