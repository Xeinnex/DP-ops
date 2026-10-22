import { cookies } from "next/headers";
import { findTeam, teams } from "@/data/teams";
import { Suspense, type ReactNode } from "react";
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
  icons: { shortcut: "/favicon.ico" },
};

async function TeamWorkspace({ children }: { children: ReactNode }) {
  const team = findTeam((await cookies()).get("dp-team")?.value ?? "T04") ?? teams[0];
  return <><meta name="dp-team" content={team.code} /><WorkspaceShell team={team} version={version.split(".").slice(0, 2).join(".")}>{children}</WorkspaceShell></>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-screen bg-canvas text-ink">
        <Suspense fallback={<p className="p-6 text-muted">Loading workspace…</p>}><TeamWorkspace>{children}</TeamWorkspace></Suspense>
      </body>
    </html>
  );
}
