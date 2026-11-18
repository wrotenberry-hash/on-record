"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentAccount, accountForAppUser, READER_COOKIE } from "@/lib/accounts";
import { currentAppUserId } from "@/lib/viewer";
import { confirmPhone, setAddress, startPhone } from "@/lib/verify/flow";
import { deleteAccountAndPositions, ensureDeviceCookie } from "@/lib/verify/store";
import { countEvent } from "@/lib/events";

async function account() {
  const a = await currentAccount();
  if (a) return a;
  const u = await currentAppUserId();
  return u ? accountForAppUser(u) : null;
}
const back = (step: string, r: { ok: boolean; message: string }) => redirect(`/account?v=${step}&ok=${r.ok ? 1 : 0}&t=${encodeURIComponent(r.message)}#verify`);

export async function sendPhoneCode(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  await ensureDeviceCookie();
  const r = await startPhone(a, { phone: String(formData.get("phone") ?? ""), consent: formData.get("consent") === "yes", turnstile: String(formData.get("cf-turnstile-response") ?? "") || null });
  await countEvent(r.ok ? "verify_sms_sent" : "verify_sms_refused", "trial");
  back(r.ok ? "code" : "phone", r);
}

export async function checkPhoneCode(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  const r = await confirmPhone(a, String(formData.get("code") ?? ""));
  await countEvent(r.ok ? "verify_phone_ok" : "verify_phone_failed", "trial");
  back(r.ok ? "address" : "code", r);
}

export async function saveAddress(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account?m=closed");
  const r = await setAddress(a, { street: String(formData.get("street") ?? ""), unit: String(formData.get("unit") ?? ""), city: String(formData.get("city") ?? ""), state: String(formData.get("state") ?? ""), zip: String(formData.get("zip") ?? "") });
  await countEvent(r.ok ? "verify_address_ok" : "verify_address_failed", "trial");
  back(r.ok ? "done" : "address", r);
}

/** Deletes the account and every answer it gave, then signs this device out. */
export async function deleteMyAccount(formData: FormData) {
  const a = await account();
  if (!a) redirect("/account");
  if (formData.get("confirm") !== "yes") redirect("/account?m=confirmdelete#delete");
  await deleteAccountAndPositions(a);
  (await cookies()).delete(READER_COOKIE);
  await countEvent("account_deleted", "trial");
  redirect("/account?m=deleted");
}
