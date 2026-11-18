"use client";
import { useActionState } from "react";
import { answerFromFlow, type AnswerState } from "@/app/start/actions";

const CHOICES = [["support", "Support"], ["oppose", "Oppose"], ["unsure", "Not sure"]] as const;

/**
 * Support / Oppose / Not sure in one tap. The answer is saved by a server action and shown as saved right here: no
 * new page, no jump to the top. The question is the one the bill page asks (lib/federal/stance-question.ts).
 */
export function StanceButtons({ billId, question, initial }: { billId: string; question: string; initial: AnswerState["answer"] }) {
  const [state, action, pending] = useActionState<AnswerState, FormData>(answerFromFlow, { billId, answer: initial, saved: false, note: null, error: null });
  const current = state.answer ?? initial, label = CHOICES.find(c => c[0] === current)?.[1];
  return <form action={action} className="stance-row flow-stance" role="group" aria-label={question}>
    <input type="hidden" name="billId" value={billId} />
    <span className="flow-q">{question}</span>
    {CHOICES.map(([value, text]) => <button key={value} type="submit" name="stance" value={value} className={current === value ? "on" : ""} aria-pressed={current === value} disabled={pending}>{text}</button>)}
    <span className={state.error ? "flow-saved err" : "flow-saved"} role="status">
      {pending ? "Saving…" : state.error ? state.error : state.saved && label ? `Saved: ${label}. ${state.note ?? "Your individual vote is private."}` : current && label ? `Your answer: ${label}.` : ""}</span>
  </form>;
}
