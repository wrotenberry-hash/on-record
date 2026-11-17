"use client";
import { useRef, useTransition } from "react";
import { IssueCap } from "@/components/start/issue-cap";
import { saveFlowIssues } from "@/app/start/actions";

/** A compact row to pick up to 3 issues (the same cap as onboarding). Each tap saves, and the list below re-sorts in place. */
export function IssuePicker({ options, initial }: { options: { slug: string; name: string }[]; initial: string[] }) {
  const form = useRef<HTMLFormElement>(null), [pending, start] = useTransition();
  const names = initial.map(s => options.find(o => o.slug === s)?.name).filter(Boolean).join(", ");
  const save = () => { const el = form.current; if (!el) return; const data = new FormData(el); start(() => saveFlowIssues(data)); };
  return <details className="flow-issues">
    <summary>{names ? `Your issues come first: ${names}. Change` : "Pick up to 3 issues to see those bills first"}</summary>
    <form ref={form} action={saveFlowIssues} onChange={save}>
      <IssueCap options={options} initial={initial} />
      <noscript><button type="submit">Save issues</button></noscript>
      <span role="status">{pending ? "Sorting…" : ""}</span>
    </form>
  </details>;
}
