"use client";
import { useActionState, useId } from "react";
import { memberAction, type MemberState } from "@/app/association/member-actions";

/**
 * The join form and the one-tap Leave buttons on the Account page. The answer ("You joined …", "That code did not
 * match …") appears above the form; the code field is cleared after each try.
 */
export function MemberForms({ memberships }: { memberships: Array<{ id: string; name: string; joined: string }> }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(memberAction, { ok: true, message: null, n: 0 });
  const id = useId();
  return <>
    {state.message && <p className={state.ok ? "gate gate-open" : "gate gate-closed"} role={state.ok ? "status" : "alert"}>{state.message}</p>}
    {memberships.length > 0 ? <ul className="analysis-list">{memberships.map(m => <li key={m.id}>
      <form action={action} className="review-actions"><input type="hidden" name="associationId" value={m.id} />
        <span><b>{m.name}</b> <span className="meta">· joined {m.joined}</span></span>
        <button name="do" value="leave" className="secondary" disabled={pending} aria-label={`Leave ${m.name}`}>Leave</button></form>
    </li>)}</ul> : <p className="meta">You are not in any association.</p>}
    <form action={action} className="verify-form">
      <label htmlFor={`${id}-code`}>Join an association: enter the code it gave you</label>
      <input key={state.n} id={`${id}-code`} name="code" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={20} required placeholder="ABCDE-FGHJK" />
      <button name="do" value="join" disabled={pending}>{pending ? "Checking…" : "Join"}</button>
    </form>
  </>;
}
