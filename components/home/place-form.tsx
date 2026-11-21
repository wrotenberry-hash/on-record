"use client";
import { useActionState, useId, useState } from "react";
import { findPlace, type PlaceState } from "@/app/start/actions";
import { PLACE_STEPS } from "@/lib/map-rules";
import { ADDRESS_PROMISE, CHECK_ADDRESS, NO_SUGGESTIONS, yesLabel } from "@/lib/address-words";

/**
 * The one form of the first screen (owner, 18 Nov 2026: address entry leads). Street address first, then the ZIP
 * code, one button. A ZIP code alone still works: the results then say what a ZIP could not find. On a problem the
 * message appears above the fields and the typing stays.
 * `compact` is the same form inside the results, where the ZIP is already known.
 *
 * 20 Nov 2026 (first trial feedback): an address the Census Bureau cannot place is never answered by falling back to
 * the ZIP. The form says "We couldn't place that address" and what to try, in order: correct it, use a nearby cross
 * street or a neighbor's address, or drop a pin on a map.
 *
 * 21 Nov 2026 (a trial reader typed his address and waited for suggestions; owner chose the option with no new key):
 * the form says suggestions do not appear, the button reads "Check address", and the address the Census Bureau matched
 * is shown back to confirm before it is saved. Under the field, in the owner's words, who the address is sent to.
 */

export function PlaceForm({ next = "/start", zip = "", compact = false, submit = "Show my legislators",
  hint = `${NO_SUGGESTIONS} A ZIP code alone also works. It finds your members of Congress; your state legislators need the street address.` }:
  { next?: string; zip?: string; compact?: boolean; submit?: string; hint?: string }) {
  const [state, action, pending] = useActionState<PlaceState, FormData>(findPlace, { error: null, message: null, zip, street: "", n: 0 });
  // "No, let me fix it" puts the match aside; the typing stays.
  const [setAside, setSetAside] = useState(-1), matched = state.confirm && setAside !== state.n ? state.confirm.matched : null;
  const id = useId(), hideZip = compact && /^\d{5}$/.test(state.zip) && state.error !== "need_zip" && state.error !== "unknown_zip";
  const pinHref = `/start/pin?next=${encodeURIComponent(next)}${/^\d{5}$/.test(state.zip) ? `&zip=${state.zip}` : ""}`;
  return <form action={action} className={compact ? "place-form place-compact" : "place-form"} noValidate>
    <input type="hidden" name="next" value={next} />
    {state.error === "no_match" ? <div className="gate gate-closed place-nomatch" role="alert">
      <p><b>{state.message}</b> Try these, in this order:</p>
      <ol className="place-steps">{PLACE_STEPS.map(s => <li key={s.key}><b>{s.key === "pin" ? <a href={pinHref}>{s.title}</a> : s.title}</b> {s.detail}</li>)}</ol>
    </div> : state.message && <p className="gate gate-closed" role="alert">{state.message}</p>}
    {matched && <div className="gate gate-open place-confirm" role="status">
      <p>The Census Bureau matched this address:</p>
      <p className="place-matched"><b>{matched}</b></p>
      <p>Is that your address?</p>
      <div className="place-confirm-actions">
        <button type="submit" name="confirm" value="1" disabled={pending}>{pending ? "Finding your legislators…" : yesLabel(submit)}</button>
        <button type="button" className="secondary" onClick={() => setSetAside(state.n)}>No, let me fix it</button>
      </div>
    </div>}
    <label htmlFor={`${id}-street`}>Street address</label>
    <input key={`s${state.n}`} id={`${id}-street`} name="street" autoComplete="street-address" defaultValue={state.street} aria-describedby={`${id}-hint`}
      aria-invalid={state.error === "no_match" ? true : undefined} />
    <p className="hint place-promise">{ADDRESS_PROMISE}</p>
    {hideZip ? <input type="hidden" name="zip" value={state.zip} /> : <>
      <label htmlFor={`${id}-zip`}>ZIP code</label>
      <input key={`z${state.n}`} id={`${id}-zip`} name="zip" inputMode="numeric" autoComplete="postal-code" maxLength={10} required defaultValue={state.zip}
        aria-invalid={state.error === "need_zip" || state.error === "unknown_zip" ? true : undefined} /></>}
    <p id={`${id}-hint`} className="hint">{hint}</p>
    <button type="submit" disabled={pending}>{pending ? "Checking your address…" : CHECK_ADDRESS}</button>
  </form>;
}
