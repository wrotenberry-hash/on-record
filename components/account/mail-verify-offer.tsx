/**
 * The one-line postcard offer under the voting box (docs/CONSTITUENT_VOICE.md, point 4: "prompted after the third
 * counted vote"). Small, optional, and gone for good on this device after "Not now". It appears only for an account
 * with a matched home address that has at least three counted answers, no postcard on its way and no review open.
 * With MAIL_VERIFICATION_ENABLED off it renders nothing and reads nothing.
 */
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { dismissMailOffer } from "@/app/account/verify-actions";
import { accountForAppUser, currentAccount } from "@/lib/accounts";
import { viewerAccess } from "@/lib/viewer";
import { countedVotesOf } from "@/lib/constituent/store";
import type { Tier } from "@/lib/constituent/rules";
import { MAIL_OFFER_COOKIE, MAIL_OFFER_LINE, flowVisible, offerShown } from "@/lib/mail-verify/rules";
import { postcardSettings } from "@/lib/mail-verify/sender";
import { postcardStateOf } from "@/lib/mail-verify/store";

const requestTime = () => Date.now();

async function shouldOffer(userId: string, tier: Tier): Promise<{ test: boolean } | null> {
  const settings = postcardSettings(process.env);
  if (tier !== "address" || (settings.mode !== "live" && settings.mode !== "mock")) return null;
  const isEditor = settings.mode === "mock" ? !!(await viewerAccess()).editor : false;
  if (!flowVisible(settings.mode, isEditor)) return null;
  const dismissed = !!(await cookies()).get(MAIL_OFFER_COOKIE)?.value;
  if (dismissed) return null;
  const account = (await currentAccount()) ?? (await accountForAppUser(userId));
  if (!account) return null;
  const db = getDb(), now = requestTime(), state = await postcardStateOf(db, account.id, settings.mode, now);
  const base = { mode: settings.mode, isEditor, tier: state.tier, dismissed, cardOutstanding: !!state.card, held: state.held };
  // The count of counted answers is the costly part, so it is read last and only when everything else allows the offer.
  if (!offerShown({ ...base, countedVotes: Number.MAX_SAFE_INTEGER })) return null;
  return offerShown({ ...base, countedVotes: await countedVotesOf(db, userId, now) }) ? { test: settings.mode === "mock" } : null;
}

export async function MailVerifyOffer({ userId, tier, back }: { userId: string | null; tier: Tier; back: string }) {
  const offer = userId ? await shouldOffer(userId, tier).catch(() => null) : null;
  if (!offer) return null;
  return <div className="meta" role="note" id="mail-offer">{offer.test ? "Test mode: " : ""}{MAIL_OFFER_LINE} <Link href="/account#mail-verify">Get a postcard</Link>{" "}
    <form action={dismissMailOffer} style={{ display: "inline" }}><input type="hidden" name="back" value={back} /><button className="link-button">Not now</button></form></div>;
}
