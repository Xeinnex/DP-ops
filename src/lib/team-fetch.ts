"use client";

// Pin requests to the team displayed in this tab, even if another tab switches.
export function teamFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("X-DP-Team", document.querySelector<HTMLMetaElement>('meta[name="dp-team"]')?.content ?? "T04");
  return fetch(input, { ...init, headers });
}
