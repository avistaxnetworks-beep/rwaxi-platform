import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BCP47 } from "./_i18n/config";
import { hostScope, requestLocale } from "./_i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "RWAXI Real Estate",
  description:
    "Activos reales · Inversiones digitales. Infraestructura de tokenización inmobiliaria White Label.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#190A36",
};

/** `lang` of the visitor's language in the vitrina and in tenant hosts; the Super-Admin console is Spanish. */
async function documentLang(): Promise<string> {
  const scope = await hostScope();
  return BCP47[scope ? await requestLocale(scope) : "es"];
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await documentLang()}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded by family name (not next/font) because the canvas renders reference these names. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=IBM+Plex+Mono:wght@400;500&family=Montserrat:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
