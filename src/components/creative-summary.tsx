"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CreativeAvatar } from "@/components/creative-avatar";

export function CreativeSummary({ alias, children }: { alias: string; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(96);

  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      const next = element.getBoundingClientRect().height;
      if (next > 0) setHeight((current) => current === next ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  return <div className="@container"><div className="flex items-center gap-4 @max-[360px]:flex-col">
    <CreativeAvatar alias={alias} size={height} />
    <div ref={content} className="min-w-0 w-full flex-1">{children}</div>
  </div></div>;
}
