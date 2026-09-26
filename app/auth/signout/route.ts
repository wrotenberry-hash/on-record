import { redirect } from "next/navigation";
import { authConfigured, supabaseServer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  if (authConfigured()) await (await supabaseServer()).auth.signOut();
  redirect("/login");
}
