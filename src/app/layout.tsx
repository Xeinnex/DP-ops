import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { WorkspaceShell } from "@/components/workspace-shell";
import { version } from "../../package.json";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DP-Ops | Creative operations",
  description: "Your local workspace for creative queues and client tickets.",
  icons: { icon: "/dp-ops.svg", shortcut: "/dp-ops.svg", apple: "/dp-ops.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-canvas text-ink">
        <WorkspaceShell version={version.split(".").slice(0, 2).join(".")}>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
