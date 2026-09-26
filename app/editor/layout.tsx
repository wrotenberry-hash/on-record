import { requireEditorUser } from "@/lib/auth";

// The checking instrument is never shown to an anonymous visitor. Identity comes
// from the session cookie on each request, so no static render.
export const dynamic = "force-dynamic";

export default async function EditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireEditorUser("/editor");
  return children;
}
