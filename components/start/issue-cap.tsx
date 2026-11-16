"use client";
import { useState } from "react";

/** The issue picker: at most 3, enforced as you tap (the server also keeps only 3). */
export function IssueCap({ options, initial, name = "issue" }: { options: { slug: string; name: string }[]; initial: string[]; name?: string }) {
  const [picked, setPicked] = useState<string[]>(initial.slice(0, 3));
  const toggle = (slug: string) => setPicked(p => p.includes(slug) ? p.filter(x => x !== slug) : p.length >= 3 ? p : [...p, slug]);
  return <fieldset className="issue-pick"><legend>Pick up to 3 issues you care about <span className="meta">({picked.length} of 3)</span></legend>
    {options.map(c => { const on = picked.includes(c.slug), full = !on && picked.length >= 3;
      return <label key={c.slug} className={`chip-check${full ? " chip-full" : ""}`}><input type="checkbox" name={name} value={c.slug} checked={on} disabled={full} onChange={() => toggle(c.slug)} /><span>{c.name}</span></label>; })}
  </fieldset>;
}
