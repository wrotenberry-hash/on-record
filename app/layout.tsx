import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "On Record — claims with evidence attached",
  description: "Trace political claims to their original communication, proposition, and evidence under review.",
  openGraph: { type: "website", siteName: "On Record", title: "On Record", description: "What they said. Where they said it. What the evidence shows. Every record is unresolved and labeled CHECKING; nothing carries a score." },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
