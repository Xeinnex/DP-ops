export interface Client { id: string; name: string }

export interface Ticket {
  id: string;
  client: string;
  clientId?: string;
  title: string;
  assignee: string;
  status: string;
  position: number | null;
  designTime: string | null;
  timeSpentMinutes: number | null;
  url: string;
  sources: ("clients" | "creatives")[];
  retained?: boolean;
  worked?: boolean;
  entryId?: string;
  occurrence?: number;
  completion?: number;
  reviewFlag?: string;
  lockedWip?: boolean;
  manualCompletion?: boolean;
  manuallyAdded?: boolean;
  dtLocked?: boolean;
  dtFrozen?: boolean;
  manualDesignTime?: boolean;
  outsideStatus?: "Assigned" | "In Progress" | "Delivered";
  deliveryOverride?: boolean;
  noBandwidth?: boolean;
}

export interface TicketResult {
  tickets: Ticket[];
  fetchedAt: string;
  pagesFetched: number;
  warnings: string[];
}
