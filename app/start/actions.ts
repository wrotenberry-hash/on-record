"use server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { userFollows } from "@/db/schema";
import { viewerAccess, currentAppUserId } from "@/lib/viewer";
import { stateForZip } from "@/lib/federal/depth-parse";
import { currentLocation, saveLocation } from "@/lib/location";
import { federalLegislators } from "@/lib/federal/legislators";
import { savePickedIssues } from "@/lib/reader-issues";
import { countEvent } from "@/lib/events";

/** Step 1: ZIP → state (and the House district when the reader picks it on step 2). */
export async function startZip(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) redirect("/start");
  const zip = String(formData.get("zip") ?? "").trim(), state = stateForZip(zip);
  if (!state) redirect("/start?e=zip");
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  await saveLocation(userId, { state, congressional: null, stateUpper: null, stateLower: null, source: "zip" });
  await countEvent("onboarding_zip", access.audience);
  redirect("/start?step=2");
}

/** Step 2: House district (when a ZIP crosses districts), three issues, and follow your legislators. Then home. */
export async function finishStart(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed) redirect("/start");
  const userId = access.invite || access.editor ? await currentAppUserId(true) : null;
  const loc = await currentLocation(userId);
  if (!loc) redirect("/start");
  const d = String(formData.get("district") ?? "");
  const district = /^[A-Z]{2}-(\d{2}|AL)$/.test(d) && d.startsWith(loc.state) ? d : loc.congressional;
  if (district !== loc.congressional) await saveLocation(userId, { ...loc, congressional: district });
  await savePickedIssues(userId, formData.getAll("issue").map(String));
  if (userId && formData.get("follow") === "yes") {
    const f = await federalLegislators(loc.state, district);
    const db = getDb();
    for (const m of [...f.senators, ...(f.representative ? [f.representative] : [])]) {
      const has = await db.select({ u: userFollows.userId }).from(userFollows).where(and(eq(userFollows.userId, userId), eq(userFollows.politicianId, m.id))).get();
      if (!has) await db.insert(userFollows).values({ userId, politicianId: m.id, createdAt: Date.now() }).onConflictDoNothing();
    }
  }
  await countEvent("onboarding_done", access.audience);
  redirect("/?welcome=1");
}
