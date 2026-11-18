/**
 * The postcard step on the Account page, after the address step (docs/CONSTITUENT_VOICE.md, point 4): ask for a
 * postcard, see that one was requested, type its code, and the result. Shown only when MAIL_VERIFICATION_ENABLED is on
 * and the account has a matched home address; in a rehearsal (no vendor) only the editor sees it, marked as a test.
 * The first level is always called address-matched here; only a mailed code makes an account mail-verified.
 */
import { getDb } from "@/db";
import { confirmMailCode, mailMeAPostcard } from "@/app/account/verify-actions";
import { flowVisible, longDate, mailNote, MAIL_NOTE_OK, POSTCARD, type MailNote } from "@/lib/mail-verify/rules";
import { postcardSettings } from "@/lib/mail-verify/sender";
import { postcardStateOf } from "@/lib/mail-verify/store";

const requestTime = () => Date.now();

export async function MailVerifySection({ accountId, isEditor, note, at, testCode }: { accountId: string; isEditor: boolean;
  /** From the web address after a step: a note name, a time, and (rehearsal only) the code. Each is checked before use. */
  note?: string; at?: string; testCode?: string }) {
  const settings = postcardSettings(process.env);
  if (!flowVisible(settings.mode, isEditor)) return null;
  const now = requestTime(), test = settings.mode === "mock";
  const state = await postcardStateOf(getDb(), accountId, settings.mode, now).catch(() => null);
  if (!state || (state.tier !== "address" && state.tier !== "mail")) return null;
  const card = state.card, done = state.tier === "mail";
  // A note that reports something done is shown only when the account's own record agrees with it.
  const allowed = note === "mail_verified" ? done : note === "test_matched" || note === "test_requested" ? test : note === "requested" ? false : true;
  const text = allowed ? mailNote(note, /^\d{13}$/.test(at ?? "") ? Number(at) : null, test ? testCode : null) : null;
  return <div id="mail-verify">
    <h3>{done ? "Mail-verified" : "4. Get a postcard (optional, free)"}</h3>
    {test && <p className="gate gate-closed" role="note"><b>Test mode.</b> Only the editor sees this step. No postcard is mailed, nothing is charged, and no account becomes mail-verified.</p>}
    {text && <p className={MAIL_NOTE_OK.includes(note as MailNote) ? "gate gate-open" : "gate gate-closed"} role="status">{text}</p>}
    {done ? <p className="meta">You typed in the code from a postcard mailed to your home address. Your answers count in the mail-verified group for where you live. If you change your home address, you will need a new postcard at the new address.</p> : <>
      <p className="meta">Your account is address-matched, and your answers already count. If you like, we can mail a postcard with a {POSTCARD.codeLength}-character code to the home address on your account. Type the code here and your account becomes mail-verified: your answers then count in the mail-verified group. It costs you nothing, and you do not have to do it.</p>
      {card ? <>
        <p role="status"><b>A postcard was requested on {longDate(card.requestedAt)}.</b> It can take about a week. Its code works until {longDate(card.expiresAt)}.</p>
        <form action={confirmMailCode} className="verify-form">
          <label htmlFor="mv-code">Enter the code from your postcard</label>
          <input id="mv-code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} required placeholder="K7M 2QX" />
          <button>Confirm code</button></form>
        {now >= card.askAgainAt ? <form action={mailMeAPostcard} className="verify-form"><p className="meta">Did it not arrive? You can ask for one more. At most two postcards can be sent to one address in a year.</p><button>Mail me one more</button></form>
          : <p className="meta">If it has not arrived by {longDate(card.askAgainAt)}, you can ask for one more.</p>}
      </> : state.held ? <p className="meta">Your account is waiting for a review. You can ask for a postcard once the review clears.</p>
        : <form action={mailMeAPostcard} className="verify-form">
          <p className="meta">The postcard goes to the home address on your account, addressed to “Current resident”. It shows the code and the name of this site, and nothing about bills or your answers. The code works for 30 days. At most two postcards can be sent to one address in a year.</p>
          <button>Mail me a postcard</button></form>}
    </>}
  </div>;
}
