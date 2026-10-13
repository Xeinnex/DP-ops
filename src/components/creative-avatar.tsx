"use client";
import Image from "next/image";
import { useState } from "react";

export function CreativeAvatar({ alias, size = 96 }: { alias: string; size?: number }) {
  const src = `/profile-pictures/PP-${encodeURIComponent(alias)}.webp`;
  const [failed, setFailed] = useState<string | null>(null);
  return <div style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-full bg-blue" role={failed === src ? "img" : undefined} aria-label={failed === src ? `${alias} profile placeholder` : undefined}>
    {failed !== src && <Image src={src} alt={`${alias} profile`} fill sizes={`${Math.ceil(size)}px`} unoptimized className="object-cover" onError={() => setFailed(src)} />}
  </div>;
}
