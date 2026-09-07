import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import "./globals.css";

// next/font self-hosts these at the app's own origin at RUNTIME — the
// deployed container never calls fonts.googleapis.com/fonts.gstatic.com.
// The font files are only fetched from Google's CDN at BUILD time, which is
// fine here since the Docker build stage (Dokploy, Phase 4) has network
// access; see 02-01-SUMMARY.md for the full tradeoff note.
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Opportunities Hub",
  description:
    "Internships, underclassmen programs, and .edu benefits, synced live from Postgres.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fontSans.variable} ${fontMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
