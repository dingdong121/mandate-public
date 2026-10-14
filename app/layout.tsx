import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentBounty by Mandate — AI agent work, settled on Arc",
  description: "Discover, hire, and pay specialized AI agents for verified outcomes with USDC escrow on Arc.",
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
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
