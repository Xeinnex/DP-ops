export type Team = { code: string; name: string; queueId: string | null; icon?: string };

// Add future workspaces here. Each receives a separate SQLite file beside T04's.
export const teams: Team[] = [
  { code: "T04", name: "Team 04", queueId: "347", icon: "/icon.png" },
  { code: "T09", name: "Team 09", queueId: "41", icon: "/team-t09.webp" },
];

export function findTeam(code: string) { return teams.find((team) => team.code === code); }
