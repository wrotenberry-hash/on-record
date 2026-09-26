import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes an expiring Supabase session cookie on editor requests so a signed-in
 * reviewer is not logged out mid-review. Anonymous and public routes pass through.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: {
    getAll() { return request.cookies.getAll(); },
    setAll(list) {
      for (const { name, value } of list) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of list) response.cookies.set(name, value, options);
    },
  } });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/editor/:path*", "/api/editor/:path*", "/login"] };
