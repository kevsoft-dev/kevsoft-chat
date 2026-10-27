import type { Viewport } from "next";
import "./globals.css";
import { LOGO } from "@/lib/mentions";

export const metadata = {
  title: "kevsoft-chat",
  description: "Komunitas dan chat publik kevsoft. Grup, chat pribadi, tag @username, dan asisten AI @kev-ai.",
  icons: { icon: LOGO, apple: LOGO },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, interactiveWidget: "resizes-content", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#090a0e" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('kc_theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f1f1eb':'#090a0e')}catch(e){document.documentElement.dataset.theme='dark'}})()` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
