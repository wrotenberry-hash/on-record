import type { BillWindow } from "@/lib/changes/types";

/**
 * "Can this bill still be changed?" on a bill page (owner, 20 Nov 2026): where the bill is, whether it can still be
 * changed, and the hearing line, each one plain sentence from lib/changes/window.ts, with the pages they rest on.
 * Shown to every visitor who can see the bill page. Nothing is shown when nothing can be said (`w` is null).
 * A hearing date appears only when the chamber's own calendar confirmed it; otherwise the line says the date isn't known.
 */
export function WindowBlock({ w }: { w: BillWindow | null }) {
  if (!w) return null;
  return <div className="bill-window" id="window" data-place={w.place} data-state={w.state}>
    <h3>Can this bill still be changed?</h3>
    <p className="window-where">{w.where}</p>
    <p className="window-changes">{w.changes}</p>
    <p className="window-hearing">{w.hearing}</p>
    {w.sources.length > 0 && <p className="meta">Worked out from the official record. Sources: {w.sources.map((x, i) => <span key={x.url}>{i ? " · " : ""}<a className="tap" href={x.url} target="_blank" rel="noopener noreferrer">{x.label}</a></span>)}</p>}
  </div>;
}
