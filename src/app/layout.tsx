import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
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
        <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
          <aside className="border-b border-line bg-panel p-5 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0 md:p-6">
            <Link href="/" className="mb-8 flex items-center gap-3 text-xl font-bold tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-limetext-inset">DP</span>DP-Ops<span className="text-lime">.</span></Link>
            <Navigation />
            <div className="mt-auto hidden pt-8 md:block"><div className="rounded-xl border border-line p-4"><p className="text-sm font-medium">Creative operations</p><p className="mt-2 text-xs text-muted">Local session</p><p className="mt-1 text-xs text-muted">Local workspace · v{version.split(".").slice(0, 2).join(".")}</p></div></div>
          </aside>
          <div className="min-w-0"><main className="mx-auto max-w-7xl px-6 py-10 sm:px-10 sm:py-12">{children}</main></div>
        </div>
      </body>
    </html>
  );
}
