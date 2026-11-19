"use client";
import { useActionState, useId } from "react";
import { findPlace, type PlaceState } from "@/app/start/actions";

/**
 * The one form of the first screen (owner, 18 Nov 2026: address entry leads). Street address first, then the ZIP
 * code, one button. A ZIP code alone still works: the results then say what a ZIP could not find. On a problem the
 * message appears above the fields and the typing stays.
 * `compact` is the same form inside the results, where the ZIP is already known.
 */
export function PlaceForm({ next = "/start", zip = "", compact = false, submit = "Show my legislators",
  hint = "A ZIP code alone also works. It finds your members of Congress; your state legislators need the street address." }:
  { next?: string; zip?: string; compact?: boolean; submit?: string; hint?: string }) {
  const [state, action, pending] = useActionState<PlaceState, FormData>(findPlace, { error: null, message: null, zip, street: "", n: 0 });
  const id = useId(), hideZip = compact && /^\d{5}$/.test(state.zip) && state.error !== "need_zip" && state.error !== "unknown_zip";
  return <form action={action} className={compact ? "place-form place-compact" : "place-form"} noValidate>
    <input type="hidden" name="next" value={next} />
    {state.message && <p className="gate gate-closed" role="alert">{state.message}</p>}
    <label htmlFor={`${id}-street`}>Street address</label>
    <input key={`s${state.n}`} id={`${id}-street`} name="street" autoComplete="street-address" defaultValue={state.street} aria-describedby={`${id}-hint`}
      aria-invalid={state.error === "no_match" ? true : undefined} />
    {hideZip ? <input type="hidden" name="zip" value={state.zip} /> : <>
      <label htmlFor={`${id}-zip`}>ZIP code</label>
      <input key={`z${state.n}`} id={`${id}-zip`} name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={10} required defaultValue={state.zip}
        aria-invalid={state.error === "need_zip" || state.error === "unknown_zip" ? true : undefined} /></>}
    <p id={`${id}-hint`} className="hint">{hint}</p>
    <button type="submit" disabled={pending}>{pending ? "Finding your legislators…" : submit}</button>
  </form>;
}
