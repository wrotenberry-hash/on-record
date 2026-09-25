import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "On Record — claims with evidence attached",
  description: "Trace political claims to their original communication, proposition, and evidence under review.",
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
