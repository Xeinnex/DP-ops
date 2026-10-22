"use client";
import { createContext, useContext } from "react";
import { teams, type Team } from "@/data/teams";

export const TeamContext = createContext<Team>(teams[0]);
export function useTeam() { return useContext(TeamContext); }
export function TeamSwitcher() {
  const team = useTeam();
  return <label className="mb-5 block text-xs text-muted">Team workspace
    <select aria-label="Team workspace" value={team.code} onChange={(event) => {
      document.cookie = `dp-team=${event.target.value}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.location.reload();
    }} className="mt-2 w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-ink">
      {teams.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
    </select>
  </label>;
}
