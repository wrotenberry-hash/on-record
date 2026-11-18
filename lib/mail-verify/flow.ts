import { getDb } from "@/db";
import { decryptAddress, keyedHash } from "@/lib/verify/crypto";
import { profileFor, recomputeBill, requestContext, withinLimit, type Account } from "@/lib/verify/store";
import { billsOfAccounts } from "@/lib/verify/residence-store";
import { flowVisible, newCode, normaliseCode, redeemNote, type MailNote } from "@/lib/mail-verify/rules";
import { postcardSettings, senderFor } from "@/lib/mail-verify/sender";
import { redeemPostcardCode, requestPostcard } from "@/lib/mail-verify/store";

/**
 * The two steps a reader takes on the Account page for a postcard: ask for one, and type its code. This is the only
 * place that touches the request and the secrets: the keyed hash of the code, and the home address, which is decrypted
 * only if a real sender asks for it and is never logged. Each step answers with a note name (lib/mail-verify/rules.ts,
 * `mailNote`), never free text. With the switch off both steps answer "off" and write nothing.
 */
export type StepResult = { note: MailNote; at?: number; testCode?: string };
const codeHashOf = (code: string) => keyedHash("mail-code", code);

export async function askForPostcard(account: Account, isEditor: boolean): Promise<StepResult> {
  const settings = postcardSettings(process.env), sender = senderFor(settings, process.env);
  if (!flowVisible(settings.mode, isEditor) || !sender) return { note: settings.mode === "not_ready" ? "not_ready" : "off" };
  if (!(await withinLimit("postcard_account_day", account.id))) return { note: "rate" };
  const now = Date.now();
  const address = async () => { const p = await profileFor(account.id); return p?.addressCipher ? decryptAddress(p.addressCipher) : null; };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const r = await requestPostcard(getDb(), { accountId: account.id, code, codeHash: await codeHashOf(code), now, mode: settings.mode, capUsd: settings.capUsd, sender, address });
    if (r.ok) return r.status === "mock" ? { note: "test_requested", at: r.requestedAt, testCode: code } : { note: "requested", at: r.requestedAt };
    if (r.reason !== "try_again") return { note: r.reason, at: r.until };
  }
  return { note: "send_failed" };
}

export async function enterPostcardCode(account: Account, raw: unknown, isEditor: boolean): Promise<StepResult> {
  const settings = postcardSettings(process.env);
  if (!flowVisible(settings.mode, isEditor)) return { note: settings.mode === "not_ready" ? "not_ready" : "off" };
  const code = normaliseCode(raw);
  if (!code) return { note: "code_format" };
  const ctx = await requestContext();
  if (!(await withinLimit("mail_code_account_day", account.id)) || !(await withinLimit("mail_code_ip_day", ctx.ipRange))) return { note: "code_rate" };
  const db = getDb(), r = await redeemPostcardCode(db, { accountId: account.id, codeHash: await codeHashOf(code), now: Date.now() });
  if (!r.ok) return { note: redeemNote(r.reason) };
  if (r.test) return { note: "test_matched" };
  // The account moves from the address-matched group to the mail-verified group in every total it is counted in; an
  // account that lost its status (the same phone, mail-verified at another address) moves back.
  for (const b of await billsOfAccounts(db, [account.id, ...r.revoked])) await recomputeBill(b);
  return { note: "mail_verified" };
}
