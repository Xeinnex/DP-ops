import type { Ticket } from "./ticket";

export interface ClientRecord { id: string; name: string; dailyMinutes: number; pc: "NO PC" | "PC" | "PC AD" }
export interface CreativeRecord { id: string; name: string; alias: string; scopes: string[]; capacityMinutes: number }
export interface Registry { clients: ClientRecord[]; creatives: CreativeRecord[] }
export interface DailyData extends Registry { day: string; tickets: Ticket[]; workedTickets: Ticket[]; fetched: { source: string; scope: string; fetchedAt: string }[] }
