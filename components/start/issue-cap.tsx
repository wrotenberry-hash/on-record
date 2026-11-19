"use client";
import { useState } from "react";

const same = (a: readonly string[], b: readonly string[]) => [...a].sort().join(",") === [...b].sort().join(",");

/**
 * The issue picker: at most 3, enforced as you tap (the server also keeps only 3).
 * When the saved list changes somewhere else on the page (the first-screen step saved it, say), the chips follow it.
 * They follow only while the reader has no taps of their own that differ from what was last saved, so a save that is
 * still on its way never undoes a tap.
 */
export function IssueCap({ options, initial, name = "issue", legend = "Pick up to 3 issues you care about" }:
  { options: { slug: string; name: string }[]; initial: string[]; name?: string; legend?: string }) {
  const [picked, setPicked] = useState<string[]>(initial.slice(0, 3)), [seen, setSeen] = useState<string[]>(initial);
  if (!same(initial, seen)) { if (same(picked, seen)) setPicked(initial.slice(0, 3)); setSeen(initial); }
  const toggle = (slug: string) => setPicked(p => p.includes(slug) ? p.filter(x => x !== slug) : p.length >= 3 ? p : [...p, slug]);
  return <fieldset className="issue-pick"><legend>{legend} <span className="meta">({picked.length} of 3)</span></legend>
    {options.map(c => { const on = picked.includes(c.slug), full = !on && picked.length >= 3;
      return <label key={c.slug} className={`chip-check${full ? " chip-full" : ""}`}><input type="checkbox" name={name} value={c.slug} checked={on} disabled={full} onChange={() => toggle(c.slug)} /><span>{c.name}</span></label>; })}
  </fieldset>;
}
