"use server";
import { cookies } from "next/headers";
import { viewerAccess } from "@/lib/viewer";
import { saveFeedback } from "@/lib/feedback";
import { cleanFeedback, FEEDBACK_COOKIE } from "@/lib/feedback-rules";
import { countEvent } from "@/lib/events";

const remember = async (value: string) => (await cookies()).set(FEEDBACK_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 24 * 3600 });

/** The one-question prompt: save the answer (no invite or reader id) and stop asking. */
export async function sendFeedback(formData: FormData) {
  const access = await viewerAccess();
  if (!access.allowed || !access.invite) return;
  const answer = cleanFeedback(formData.get("answer"));
  if (formData.get("action") === "dismiss" || !answer) { await remember("dismissed"); await countEvent("feedback_dismissed", access.audience); return; }
  await saveFeedback(answer, access.audience);
  await countEvent("feedback_sent", access.audience);
  await remember("sent");
}
