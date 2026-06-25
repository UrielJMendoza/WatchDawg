import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClassificationBanner } from "@/components/classification-banner";
import "./globals.css";

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
  title: "GOTHAM — Geopolitical Intelligence",
  description:
    "Live OSINT command center tracking the Iran–Israel and Russia–Ukraine theaters.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <ClassificationBanner position="top" />
        <div className="pb-6">{children}</div>
        <ClassificationBanner position="bottom" />
      </body>
    </html>
  );
}
