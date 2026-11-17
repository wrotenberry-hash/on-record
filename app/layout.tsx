import type { Metadata } from "next";
import "./globals.css";
import { PUBLIC_READ_FLAG, publicReadEnabled } from "@/lib/public-access";
import { BRAND } from "@/lib/brand";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://on-record-wrotenberry.vercel.app";

/** Site-wide defaults. While public reading is off, every page asks search engines not to index it. */
export async function generateMetadata(): Promise<Metadata> {
  const publicRead = publicReadEnabled(process.env[PUBLIC_READ_FLAG]);
  return {
    metadataBase: new URL(SITE_URL),
    title: `${BRAND.name}: the congressional record, in plain words`,
    description: "How every member of Congress voted, what each bill would do, and political claims checked against the evidence. No scores, no grades.",
    openGraph: { type: "website", siteName: BRAND.name, title: BRAND.name, description: `${BRAND.tagline} Official votes, plain-language bills, and claims checked by a person. No scores.` },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    ...(publicRead ? {} : { robots: { index: false, follow: false } }),
  };
}

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
