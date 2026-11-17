"use client";
import { useActionState, useId } from "react";
import { findPlace, type PlaceState } from "@/app/start/actions";

/**
 * The one form of the first minute: a ZIP code, and a street address for those who want their state legislators too.
 * A ZIP and one tap is enough. On a problem the message appears above the fields and the typing stays.
 * `compact` is the same form inside the results, where the ZIP is already known.
 */
export function PlaceForm({ next = "/start", zip = "", compact = false, submit = "Show my legislators", hint = "Add your street address to find your state legislators too." }:
  { next?: string; zip?: string; compact?: boolean; submit?: string; hint?: string }) {
  const [state, action, pending] = useActionState<PlaceState, FormData>(findPlace, { error: null, message: null, zip, street: "", n: 0 });
  const id = useId(), hideZip = compact && /^\d{5}$/.test(state.zip) && state.error !== "need_zip" && state.error !== "unknown_zip";
  return <form action={action} className={compact ? "place-form place-compact" : "place-form"} noValidate>
    <input type="hidden" name="next" value={next} />
    {state.message && <p className="gate gate-closed" role="alert">{state.message}</p>}
    {hideZip ? <input type="hidden" name="zip" value={state.zip} /> : <>
      <label htmlFor={`${id}-zip`}>ZIP code</label>
      <input key={`z${state.n}`} id={`${id}-zip`} name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={10} required defaultValue={state.zip}
        aria-invalid={state.error === "need_zip" || state.error === "unknown_zip" ? true : undefined} /></>}
    <label htmlFor={`${id}-street`}>Street address {!compact && <span className="optional">(optional)</span>}</label>
    <input key={`s${state.n}`} id={`${id}-street`} name="street" autoComplete="street-address" defaultValue={state.street} aria-describedby={`${id}-hint`}
      aria-invalid={state.error === "no_match" ? true : undefined} />
    <p id={`${id}-hint`} className="hint">{hint}</p>
    <button type="submit" disabled={pending}>{pending ? "Finding your legislators…" : submit}</button>
  </form>;
}
