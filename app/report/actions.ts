"use server";
import { redirect } from "next/navigation";
import { viewerAccess } from "@/lib/viewer";
import { reportProblem } from "@/lib/problems";
import { ensureDeviceCookie } from "@/lib/verify/store";

/** "Report a problem" from any card or share page. */
export async function sendProblemReport(formData: FormData) {
  const access = await viewerAccess();
  const page = String(formData.get("page") ?? "/");
  const back = page.startsWith("/") && !page.startsWith("//") ? page : "/";
  if (!access.allowed) redirect("/");
  await ensureDeviceCookie();
  const r = await reportProblem({ subjectKind: String(formData.get("subjectKind") ?? ""), subjectRef: String(formData.get("subjectRef") ?? ""), page: back, reason: String(formData.get("reason") ?? ""), details: formData.get("details") });
  redirect(`${back}${back.includes("?") ? "&" : "?"}reported=${r}#report`);
}
