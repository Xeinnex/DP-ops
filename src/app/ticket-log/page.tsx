import { Suspense } from "react";
import { TicketLog } from "@/components/ticket-log";
export default function TicketLogPage() { return <Suspense fallback={<p className="text-muted">Loading ticket history…</p>}><TicketLog /></Suspense>; }
