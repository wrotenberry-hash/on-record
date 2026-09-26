import { redirect } from "next/navigation";
import { authConfigured, loginPath, safeRelativeReturnPath, supabaseServer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** The magic link lands here; the one-time code becomes an HttpOnly session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeRelativeReturnPath(url.searchParams.get("return_to"));
  const code = url.searchParams.get("code");
  if (!authConfigured() || !code) redirect(`${loginPath(returnTo)}&status=error`);
  const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
  if (error) redirect(`${loginPath(returnTo)}&status=error`);
  redirect(returnTo);
}
