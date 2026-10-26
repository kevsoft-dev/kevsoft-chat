import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { cfg } from "@/lib/config";

export const metadata = { title: "Obrolan", description: "Chat pribadi, cepat, dan aman" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={cfg.clerk.publishableKey}>
      <html lang="id">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
