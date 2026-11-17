import { PROBLEM_REASONS } from "@/lib/problems";
import { REASON_MAX } from "@/lib/verify/rules";
import { sendProblemReport } from "@/app/report/actions";

/**
 * "Report a problem" on every card, and (through /report, linked from every page's footer) on every page.
 * Reports go to the editor and, once fixed, to the corrections log. A plain form: it works without JavaScript.
 */
export function ReportProblem({ subjectKind, subjectRef, page, status, label = "Report a problem with this card", open = false, returnTo }:
  { subjectKind: string; subjectRef: string; page: string; status?: string; label?: string; open?: boolean; returnTo?: "/report" }) {
  return <details className="method report-problem" id="report" open={open || !!status}>
    <summary>{label}</summary>
    {status === "ok" ? <p className="meta" role="status">Thank you. The editor reviews every report; fixes are listed on the corrections page.</p>
      : status === "rate" ? <p className="meta" role="status">You have sent several reports today. Please try again tomorrow.</p> : null}
    {status !== "ok" && <form action={sendProblemReport} className="verify-form">
      <input type="hidden" name="subjectKind" value={subjectKind} /><input type="hidden" name="subjectRef" value={subjectRef} /><input type="hidden" name="page" value={page} />{returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <fieldset><legend>What is wrong?</legend>
        {Object.entries(PROBLEM_REASONS).map(([k, label], i) => <label key={k} className="consent"><input type="radio" name="reason" value={k} required defaultChecked={i === 0} /> <span>{label}</span></label>)}</fieldset>
      <label htmlFor={`report-details-${subjectKind}`}>Details (optional, {REASON_MAX} characters, seen only by the editor)
        <textarea id={`report-details-${subjectKind}`} name="details" maxLength={REASON_MAX} rows={3} /></label>
      <button>Send report</button></form>}
  </details>;
}
