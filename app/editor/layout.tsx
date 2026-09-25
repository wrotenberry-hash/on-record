import { requireChatGPTUser } from "@/app/chatgpt-auth";

// The checking instrument is never shown to an anonymous visitor, whatever the
// Site audience is. Identity comes from per-request headers, so no static render.
export const dynamic = "force-dynamic";

export default async function EditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireChatGPTUser("/editor");
  return children;
}
