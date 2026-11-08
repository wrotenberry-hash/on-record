// The checking instrument is never shown to an anonymous visitor: every page
// under /editor calls requireEditorUser with its own return path (see page.tsx),
// and every /api/editor route checks editorialAuth. No static render.
export const dynamic = "force-dynamic";

export default function EditorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
