export const defaultTeam = { id: "347", name: "Team 04" };

export const creatives = [
  { name: "Ailen Ximena Cristaldo", alias: "Ailen", designerId: "2812" },
  { name: "Diana Carolina Rodriguez Nino", alias: "Diana", designerId: "1516" },
  { name: "Edgar Jean-Pierre Torres Chamorro", alias: "Edgar", designerId: "5371" },
  { name: "Faisal Adly Aditya Pradana", alias: "Faisal", designerId: "2191" },
  { name: "Muhammad Haqqy Naazily Rifa'i", alias: "Haqqy", designerId: "1238" },
  { name: "Juan Esteban Osorio Tehelen", alias: "Juanes", designerId: "8284" },
  { name: "Muhammad Triadi Santoso Azis", alias: "Andrew", designerId: "2052" },
  { name: "Martin Ignacio Butchart Reyes", alias: "Nacho", designerId: "1520" },
];

const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

export function creativeAlias(name: string) {
  return creatives.find((creative) => normalize(creative.name) === normalize(name))?.alias ?? name;
}

export function creativeQueueUrl(teamId: string = defaultTeam.id) {
  if (!/^\d+$/.test(teamId)) throw new Error("Team ID must contain digits only.");
  const url = new URL("https://jar.designpickle.com/admin/tickets");
  ["1", "2", "3", "4"].forEach((state) => url.searchParams.append("q[state_in][]", state));
  url.searchParams.append("q[designer_qr_team_id_in][]", teamId);
  return url.toString();
}
