import { BRAND } from "./brand.ts";
import { readerEmailReady } from "./reader-email.ts";
/**
 * Email to a reader through Resend (the account already used for alerts). Until a
 * sending domain is verified in Resend, its shared test sender delivers only to
 * the account owner's own address; other recipients are refused, and the caller
 * says so plainly instead of pretending the email went.
 */
const RESEND_API_URL = process.env.RESEND_API_URL?.trim() || "https://api.resend.com/emails";
const DEFAULT_FROM = `${BRAND.name} <onboarding@resend.dev>`;

export type SendResult = { ok: true; id?: string } | { ok: false; error: string; domainNeeded: boolean };

/** `html`, when given, is sent beside the text: mail apps that show HTML use it, the rest show the text. */
export async function sendTo(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set", domainNeeded: false };
  const from = process.env.READER_FROM_EMAIL?.trim() || process.env.ALERT_FROM_EMAIL?.trim() || DEFAULT_FROM;
  try {
    const response = await fetch(RESEND_API_URL, { method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }) });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (response.ok) return { ok: true, id: body.id };
    const message = `${body.message ?? body.name ?? "error"}`;
    // Resend answers 403 with "You can only send testing emails to your own email address" without a verified domain.
    return { ok: false, error: `Resend ${response.status}: ${message}`.slice(0, 200), domainNeeded: response.status === 403 || /verify a domain|testing emails/i.test(message) };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : "send failed", domainNeeded: false }; }
}

/**
 * Email that the site sends to readers on its own initiative: the weekly email, vote alerts, notices about bills.
 * (A sign-in link the reader just asked for goes through `sendTo` above.)
 *
 * Until a sending address on the site's own verified domain is set (`READER_FROM_EMAIL`), the only inbox the shared
 * test sender can reach is the account owner's, and the owner has said no automatic emails. So without that address
 * nothing is sent at all, and the caller is told why. Readers still get the notice on the site and by phone
 * notification. 18 Nov 2026.
 */
export { readerEmailReady } from "./reader-email.ts";
export async function sendToReader(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  if (!readerEmailReady()) return { ok: false, error: "Emails to readers are off until a sending address on the site's own domain is set (READER_FROM_EMAIL)", domainNeeded: true };
  return sendTo(to, subject, text, html);
}
