const colors: Record<string, string> = {
  GD: "text-lime", PD: "text-fuchsia-400", FIG: "text-orange-400",
  CI: "text-yellow-300", MG: "text-purple-400", VE: "text-cyan-300",
};

export function ScopeBadges({ scopes }: { scopes: string[] }) {
  return <span className="flex flex-wrap gap-1" aria-label={`Scopes: ${scopes.join(", ") || "none"}`}>
    {scopes.map((scope) => <span key={scope} className={`grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black text-[7px] font-bold ${colors[scope] || "text-white"}`}>{scope}</span>)}
  </span>;
}
