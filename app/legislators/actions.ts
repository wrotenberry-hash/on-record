"use server";
import { redirect } from "next/navigation";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { clearLocation } from "@/lib/location";
import { rememberZip } from "@/lib/flow/zip";

/**
 * Finding the place (ZIP, or ZIP and street address) and choosing a House district are the same actions as the
 * first-minute flow: `findPlace` and `chooseDistrict` in app/start/actions.ts. This page only adds forgetting it.
 */
export async function forgetLocation() {
  const access = await viewerAccess();
  const userId = access.invite || access.editor ? await currentAppUserId() : null;
  await clearLocation(userId);
  await rememberZip(null);
  redirect("/legislators");
}
