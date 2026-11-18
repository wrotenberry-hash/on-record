"use client";
import { useActionState } from "react";
import { createAssociationAction, newCodeAction, type CodeState } from "@/app/editor/associations/actions";

const NONE: CodeState = { message: null, code: null, name: null };

/** The join code, on the screen once. It is not stored, so it cannot be shown again: only replaced. */
function CodeOnce({ state }: { state: CodeState }) {
  if (state.message) return <p className="gate gate-closed" role="alert">{state.message}</p>;
  if (!state.code) return null;
  return <div className="gate gate-open" role="status">
    <p><b>Join code for {state.name}: <code>{state.code}</code></b></p>
    <p>Copy it now and pass it to the association. It is shown this one time. Only a scrambled form of it is stored, so it cannot be shown again; you can make a new one, which replaces it.</p>
  </div>;
}

/** Editor: make an association. */
export function CreateAssociationForm() {
  const [state, action, pending] = useActionState<CodeState, FormData>(createAssociationAction, NONE);
  return <>
    <CodeOnce state={state} />
    <form action={action} className="review-actions">
      <input name="name" key={state.code ?? "name"} required minLength={3} maxLength={80} placeholder="Name of the association" aria-label="Name of the association" />
      <button disabled={pending}>{pending ? "Making it…" : "Add association"}</button></form>
  </>;
}

/** Editor: replace an association's join code (the old one stops working). */
export function NewCodeForm({ associationId, name }: { associationId: string; name: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(newCodeAction, NONE);
  return <>
    <CodeOnce state={state} />
    <form action={action}><input type="hidden" name="associationId" value={associationId} /><input type="hidden" name="name" value={name} />
      <button className="link-button" disabled={pending}>Make a new join code (the old one stops working)</button></form>
  </>;
}
