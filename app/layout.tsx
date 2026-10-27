import { ClerkProvider } from "@clerk/nextjs";
import type { Viewport } from "next";
import "./globals.css";
import { cfg } from "@/lib/config";

export const metadata = {
  title: "kevsoft-chat",
  description: "Komunitas dan chat publik kevsoft. Grup, chat pribadi, tag @username, dan asisten AI @kev-ai.",
};
export const viewport: Viewport = { themeColor: "#090a0e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={cfg.clerk.publishableKey}
      appearance={{
        variables: {
          colorPrimary: "#cef778", colorText: "#f5f5ef", colorTextSecondary: "#a2a4ae",
          colorBackground: "#15161d", colorInputBackground: "#1c1d27", colorInputText: "#f5f5ef",
          colorTextOnPrimaryBackground: "#11150c", colorNeutral: "#f5f5ef", borderRadius: "14px",
          fontFamily: "DM Sans, system-ui, sans-serif",
        },
      }}
    >
      <html lang="id">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
