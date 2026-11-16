import { sendFeedback } from "@/app/feedback/actions";
import { FEEDBACK_MAX, FEEDBACK_QUESTION } from "@/lib/feedback-rules";

/** Shown once to a trial reader on their third day; answering or "Not now" ends it. */
export function FeedbackPrompt() {
  return <form action={sendFeedback} className="feedback-prompt" aria-labelledby="fb-q">
    <label id="fb-q" htmlFor="fb-answer"><b>One question.</b> {FEEDBACK_QUESTION}</label>
    <textarea id="fb-answer" name="answer" rows={2} maxLength={FEEDBACK_MAX} placeholder="A sentence is plenty." />
    <div className="feedback-actions"><button name="action" value="send">Send</button><button name="action" value="dismiss" className="secondary" formNoValidate>Not now</button></div>
    <small>Sent anonymously: we do not store which invite or page it came from.</small>
  </form>;
}
