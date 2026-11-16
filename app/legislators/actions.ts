"use server";
import { redirect } from "next/navigation";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { legislatorsForAddress } from "@/lib/federal/legislators";
import { stateForZip } from "@/lib/federal/depth-parse";
import { clearLocation, saveLocation } from "@/lib/location";
import { countEvent } from "@/lib/events";

/** ZIP or street address to districts. The address goes to the Census geocoder and is not kept; only district ids are saved. */
export async function findLegislators(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) redirect("/legislators");
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const zip = String(formData.get("zip") ?? "").trim(), street = String(formData.get("street") ?? "").trim();
  const back = String(formData.get("next") ?? "/legislators");
  const next = back.startsWith("/") && !back.startsWith("//") ? back : "/legislators";
  if (street) {
    const r = await legislatorsForAddress(`${street}${zip ? `, ${zip}` : ""}`);
    await countEvent(r.ok ? "lookup_address_ok" : "lookup_address_failed", access.audience);
    if (!r.ok) redirect(`/legislators?e=${r.reason}`);
    await saveLocation(userId, { state: r.districts.state, congressional: r.districts.congressional, stateUpper: r.districts.stateUpper, stateLower: r.districts.stateLower, source: "address" });
    redirect(next);
  }
  const state = stateForZip(zip);
  await countEvent(state ? "lookup_zip_ok" : "lookup_zip_failed", access.audience);
  if (!state) redirect("/legislators?e=bad_zip");
  await saveLocation(userId, { state, congressional: null, stateUpper: null, stateLower: null, source: "zip" });
  redirect(next === "/legislators" ? "/legislators?z=1" : next);
}

/** Picks the House member from the state's list when only a ZIP is known. */
export async function pickDistrict(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) redirect("/legislators");
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const d = String(formData.get("district") ?? "");
  const m = d.match(/^([A-Z]{2})-(\d{2}|AL)$/);
  if (!m) redirect("/legislators");
  await saveLocation(userId, { state: m[1], congressional: d, stateUpper: null, stateLower: null, source: "zip" });
  redirect("/legislators");
}

export async function forgetLocation() {
  const access = await viewerAccess();
  const userId = access.invite || access.editor ? await currentAppUserId() : null;
  await clearLocation(userId);
  redirect("/legislators");
}
