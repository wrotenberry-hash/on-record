import { getEditorUser } from "@/lib/auth";

/**
 * Every editorial mutation and every private read passes through here. A
 * missing identity is 401; an identity outside the allowlist is 403. An empty
 * allowlist fails closed.
 */
export async function editorialAuth() {
  const user = await getEditorUser();
  if (!user) return { user: null, error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const ids = new Set((process.env.EDITOR_USER_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean));
  const emails = new Set((process.env.EDITOR_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
  if (!ids.has(user.userId) && !emails.has(user.email.toLowerCase())) {
    return { user: null, error: Response.json({ error: "Editorial access denied" }, { status: 403 }) };
  }
  return { user, error: null };
}

export function editorJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
