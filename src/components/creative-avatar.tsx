"use client";
import Image from "next/image";
import { useState } from "react";
import type { CreativeAvailability } from "@/types/operations";

export function CreativeAvatar({ alias, size = 96, availability = "available" }: { alias: string; size?: number; availability?: CreativeAvailability }) {
  const src = `/profile-pictures/PP-${encodeURIComponent(alias)}.webp`;
  const [failed, setFailed] = useState<string | null>(null);
  const dimension = `min(${size}px, var(--creative-avatar-max, 96px))`;
  return <div style={{ width: dimension, height: dimension }} className={`shrink-0 rounded-full p-[2px] ${availability === "away" ? "bg-red-500" : availability === "half_day" ? "bg-yellow-400" : "bg-lime"}`}>
    <div style={{ filter: failed !== src ? availability === "half_day" ? "saturate(2)" : availability === "away" ? "saturate(0.55)" : undefined : undefined }} className="relative isolate h-full w-full overflow-hidden rounded-full bg-blue" role={failed === src ? "img" : undefined} aria-label={failed === src ? `${alias} profile placeholder` : undefined}>
      {failed !== src && <Image src={src} alt={`${alias} profile`} fill sizes={`${Math.ceil(size)}px`} loading="eager" unoptimized className="object-cover" onError={() => setFailed(src)} />}
      {failed !== src && availability !== "available" && <div aria-hidden="true" className={`pointer-events-none absolute inset-0 rounded-full mix-blend-hue ${availability === "away" ? "bg-red-500" : "bg-yellow-400"}`} />}
    </div>
  </div>;
}
