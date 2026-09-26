"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, safeRelativeReturnPath, supabaseServer } from "@/lib/auth";

/** Sends a magic link. Any address is accepted here; the allowlist decides on arrival. */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const returnTo = safeRelativeReturnPath(String(formData.get("return_to") ?? ""));
  if (!authConfigured()) redirect(`/login?status=unconfigured&return_to=${encodeURIComponent(returnTo)}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) redirect(`/login?status=invalid&return_to=${encodeURIComponent(returnTo)}`);
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email,
    options: { emailRedirectTo: `${origin}/auth/callback?return_to=${encodeURIComponent(returnTo)}`, shouldCreateUser: true } });
  if (error) {
    console.error("Magic link failed", error.message);
    redirect(`/login?status=error&return_to=${encodeURIComponent(returnTo)}`);
  }
  redirect(`/login?status=sent&return_to=${encodeURIComponent(returnTo)}`);
}
