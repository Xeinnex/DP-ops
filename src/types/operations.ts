import type { Ticket } from "./ticket";

export interface ClientRecord { id: string; companyId?: string; name: string; dailyMinutes: number; pc: "NO PC" | "PC" | "PC AD" }
export interface CreativeRecord { id: string; designerId?: string | null; name: string; alias: string; scopes: string[]; capacityMinutes: number }
export interface CreativeProgress { creativeId: string; assignedMinutes: number; completedMinutes: number; capacityMinutes: number; capturedAt?: string }
export interface Registry { clients: ClientRecord[]; creatives: CreativeRecord[] }
export interface DailyData extends Registry { day: string; tickets: Ticket[]; workedTickets: Ticket[]; previousProgress?: CreativeProgress[]; fetched: { source: string; scope: string; fetchedAt: string }[] }
