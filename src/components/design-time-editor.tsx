"use client";

import { useState, type FormEvent } from "react";
import type { Ticket } from "@/types/ticket";
import type { DailyData } from "@/types/operations";

export function DesignTimeEditor({ ticket, day, disabled, onBusy, onSaved }: { ticket: Ticket; day: string; disabled: boolean; onBusy: (busy: boolean) => void; onSaved: (data: DailyData) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); onBusy(true); setError("");
    try {
      const response = await fetch("/api/design-time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, entryId: ticket.entryId, designTime: value }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      onSaved(body); setEditing(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update DT."); }
    finally { onBusy(false); }
  }
  if (!editing) return <button disabled={disabled} onClick={() => { setValue(ticket.designTime || ""); setError(""); setEditing(true); }} className="rounded-md border border-blue/40 px-2 py-1 text-xs text-blue disabled:opacity-40">Edit DT</button>;
  return <form onSubmit={save} className="flex flex-wrap items-center gap-2">
    <label className="text-xs text-muted">DT <input aria-label={`Design time for ticket ${ticket.id}, entry ${ticket.occurrence}`} required pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="0:00" value={value} onChange={(event) => setValue(event.target.value)} disabled={disabled} className="w-20 rounded-md border border-line bg-panel px-2 py-1 font-mono text-ink" /></label>
    <button disabled={disabled} className="rounded-md border border-blue/40 px-2 py-1 text-xs text-blue disabled:opacity-40">Save DT</button>
    <button type="button" disabled={disabled} onClick={() => setEditing(false)} className="text-xs text-muted">Cancel</button>
    {error && <span role="alert" className="text-xs text-red-300">{error}</span>}
  </form>;
}
