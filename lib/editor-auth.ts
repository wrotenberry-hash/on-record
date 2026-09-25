import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function editorialAuth() {
  const user = await getChatGPTUser();
  if (!user) return { user: null, error: Response.json({ error: "Authentication required" }, { status: 401 }) };
  const bindings = env as unknown as { EDITOR_USER_IDS?: string; EDITOR_EMAILS?: string };
  const ids = new Set((bindings.EDITOR_USER_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean));
  const emails = new Set((bindings.EDITOR_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
  if (!ids.has(user.userId) && !emails.has(user.email.toLowerCase())) {
    return { user: null, error: Response.json({ error: "Editorial access denied" }, { status: 403 }) };
  }
  return { user, error: null };
}

export function editorJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
