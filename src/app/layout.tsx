import type { Metadata } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { copy } from "@/copy/fr";
import "./globals.css";

const schibstedGrotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-schibsted",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: copy.app.name,
  description: copy.app.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${schibstedGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh bg-bg font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
