import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ClassificationBanner } from "@/components/classification-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WatchDawg — Maritime OSINT",
  description:
    "OSINT maritime security dashboard for the Red Sea and Horn of Africa. UNCLASSIFIED // OSINT.",
  robots: { index: false, follow: false },
};

/**
 * Root layout. The classification banners are the first and last DOM
 * nodes inside <body> so screen readers announce them bracketing every
 * page. Main content is padded top/bottom by the 24px banner height so
 * fixed banners never occlude.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-8 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-3 focus:py-1 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <ClassificationBanner position="top" />
        <div
          id="main"
          className="flex min-h-screen flex-col pt-6 pb-6"
        >
          {children}
        </div>
        <ClassificationBanner position="bottom" />
      </body>
    </html>
  );
}
