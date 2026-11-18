"use client";
import { useActionState, useId } from "react";
import { requestOfficeLink, type OfficeRequestState } from "@/app/office/actions";

/**
 * The office sign-in form: a work email address, and, only where the address does not show which office the person
 * works for, the list of members to choose from. The address stays in the form; it is never put in the page address.
 */
export function OfficeRequestForm() {
  const [state, action, pending] = useActionState<OfficeRequestState, FormData>(requestOfficeLink, { step: "ask", message: null, error: false, email: "", options: [], n: 0 });
  const id = useId();
  return <form action={action} className="verify-form office-form" noValidate>
    {state.message && <p className={state.error ? "gate gate-closed" : "gate gate-open"} role={state.error ? "alert" : "status"}>{state.message}</p>}
    <label htmlFor={`${id}-email`}>Your work email address</label>
    <input key={`e${state.n}`} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state.email} aria-invalid={state.error ? true : undefined} />
    {state.step === "pick" && <>
      <label htmlFor={`${id}-member`}>The member you work for</label>
      <select id={`${id}-member`} name="member" required defaultValue="">
        <option value="" disabled>Choose a member</option>
        {state.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select></>}
    <button type="submit" disabled={pending}>{pending ? "One moment…" : state.step === "pick" ? "Email me a link" : "Continue"}</button>
  </form>;
}
