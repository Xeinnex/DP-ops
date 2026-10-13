import type { ReactNode } from "react";

export function QueueLink({ href, children, className = "" }: { href?: string; children: ReactNode; className?: string }) {
  if (!href) return <span className={className}>{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className={`hover:underline ${className}`} title="Open active queue">{children}</a>;
}
