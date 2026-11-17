import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Boli Recover — Wrong-network fund recovery",
  description:
    "Find and move funds stuck on the wrong EVM network. Read-only scan; moving funds requires signed proof of ownership. Self-custody — we never ask for your seed phrase.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
