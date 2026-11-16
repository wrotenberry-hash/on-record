"use client";
import { useId, useState } from "react";

/** A glossary term: tap or focus to see the plain-language definition. Keyboard and screen-reader friendly. */
export function Term({ children, definition }: { children: React.ReactNode; definition: string }) {
  const [open, setOpen] = useState(false), id = useId();
  return <span className="term">
    <button type="button" className="term-btn" aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}>{children}</button>
    {open && <span role="tooltip" id={id} className="term-tip">{definition}</span>}
  </span>;
}
