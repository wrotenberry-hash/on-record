"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A section of the bill page shown as one tappable heading with a short hint of what is inside (owner, 21 Nov 2026,
 * after two trial readers said the page has too much text: "Collapse every other section to a single tappable heading
 * with a short hint of what is inside … Remember each reader's open or closed choices.").
 *
 * Closed until tapped. The reader's choice is remembered on their own device, by section and not by bill, so someone
 * who always opens "Reasons for and against" finds it open on the next bill too. Nothing is sent to the site. A link
 * that points at something inside a closed section (a vote, the contact panel) opens it.
 */
const key = (id: string) => `or_fold:${id}`;

export function Fold({ id, title, count, hint, badge, children }: { id: string; title: string; /** How many items are inside: shown beside the title, "Reasons for and against (4)". */ count?: number | null;
  /** A few words on what is inside, on a line of its own under the title. */ hint?: string | null; badge?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const openForTarget = () => { const h = window.location.hash.slice(1); if (h && el.querySelector(`[id="${CSS.escape(h)}"]`)) { el.open = true; document.getElementById(h)?.scrollIntoView(); } };
    try { if (window.localStorage.getItem(key(id)) === "1") el.open = true; } catch { /* private mode: nothing is remembered */ }
    openForTarget();
    window.addEventListener("hashchange", openForTarget);
    return () => window.removeEventListener("hashchange", openForTarget);
  }, [id]);
  return <details ref={ref} className="fold" data-fold={id} onToggle={e => { try { window.localStorage.setItem(key(id), e.currentTarget.open ? "1" : "0"); } catch { /* not remembered */ } }}>
    <summary><span className="fold-head"><h2 className="fold-title">{title}{count != null ? ` (${count})` : ""}{badge ? <> {badge}</> : null}</h2>{hint ? <span className="fold-hint">{hint}</span> : null}</span></summary>
    <div className="fold-body">{children}</div>
  </details>;
}
