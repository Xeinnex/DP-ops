import type { Ticket } from "./ticket";

export interface ClientRecord { id: string; companyId?: string; name: string; dailyMinutes: number; pc: "NO PC" | "PC" | "PC AD" }
export type CreativeAvailability = "available" | "half_day" | "away";
export interface CreativeRecord { id: string; designerId?: string | null; name: string; alias: string; scopes: string[]; capacityMinutes: number; availability?: CreativeAvailability }
export interface CreativeProgress { creativeId: string; assignedMinutes: number; completedMinutes: number; capacityMinutes: number; capturedAt?: string }
export interface Registry { clients: ClientRecord[]; creatives: CreativeRecord[] }
export interface DailyData extends Registry { day: string; tickets: Ticket[]; workedTickets: Ticket[]; clientActivity?: Record<string, string>; previousProgress?: CreativeProgress[]; fetched: { source: string; scope: string; fetchedAt: string }[] }
