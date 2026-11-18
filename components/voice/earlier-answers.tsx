/**
 * The one-time question about answers given before answers were added into totals (owner, 18 Nov 2026): they stay
 * uncounted unless the reader chooses, on their next visit, to count them. Shown at the top of the home page, the
 * "Your voice" page and every bill's voting box until the reader has answered it once.
 */
import { getDb } from "@/db";
import { importLegacy } from "@/lib/constituent/store";
import { legacyPrompt } from "@/lib/constituent/rules";
import { chooseEarlierAnswers } from "@/app/voice/actions";

export async function EarlierAnswers({ userId, back }: { userId: string | null; back: string }) {
  if (!userId) return null;
  const l = await importLegacy(getDb(), userId).catch(() => null);
  const ask = l ? legacyPrompt(l.pending, l.choice) : null;
  if (!ask) return null;
  return <form action={chooseEarlierAnswers} className="gate gate-closed legacy-choice" role="group" aria-label="Your earlier answers" id="earlier-answers">
    <p><b>Something changed.</b> Your individual vote is private, as before. From now on, counted votes are added into anonymous totals. {ask}</p>
    <input type="hidden" name="back" value={back} />
    <span><button name="choice" value="count">Yes, count them</button> <button name="choice" value="private" className="secondary">No, keep them private</button></span>
  </form>;
}
