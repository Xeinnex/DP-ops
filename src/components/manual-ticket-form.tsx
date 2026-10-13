"use client";

import { useState, type FormEvent } from "react";
import type { DailyData } from "@/types/operations";
import { manualStatuses } from "@/lib/manual-ticket";

export function ManualTicketForm({ creatives, onSaved, onCancel }: { creatives: DailyData["creatives"]; onSaved: (data: DailyData) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [designTime, setDesignTime] = useState("");
  const [status, setStatus] = useState("Customer Review");
  const [detail, setDetail] = useState<{ client: string; title: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = "mt-1 w-full rounded-lg border border-line bg-inset px-3 py-2 text-sm text-ink";

  async function submit(action: "lookup" | "add") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/manual-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, url, creativeId, designTime, status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (action === "add") onSaved(body);
      else {
        setDetail(body);
        if (manualStatuses.includes(body.status)) setStatus(body.status);
        else if (body.status.startsWith("In Progress")) setStatus("In Progress");
        else if (body.status.startsWith("Incomplete")) setStatus("Incomplete (WIP)");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save ticket."); }
    finally { setBusy(false); }
  }

  function save(event: FormEvent) { event.preventDefault(); void submit("add"); }

  return <form onSubmit={save} className="rounded-xl border border-blue/40 bg-panel p-5">
    <div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-lime">Add missed ticket</h2><button type="button" disabled={busy} onClick={onCancel} className="text-sm text-muted">Cancel</button></div>
    <p className="mt-2 text-xs text-muted">Saved for today in Bogotá. Look up the client and status, then enter the DT and creative for this work.</p>
    <fieldset disabled={busy} className="mt-4 space-y-4 disabled:opacity-60">
      <div className="flex flex-wrap items-end gap-3"><label className="min-w-60 flex-1 text-xs text-muted">Ticket URL<input type="url" required value={url} onChange={(event) => { setUrl(event.target.value); setDetail(null); }} placeholder="https://jar.designpickle.com/admin/tickets/1234567" className={field} /></label><button type="button" onClick={() => submit("lookup")} disabled={!url} className="rounded-lg border border-blue px-4 py-2 text-sm text-blue disabled:opacity-40">Look up ticket</button></div>
      {detail && <div className="rounded-lg bg-inset p-3 text-sm"><p className="font-medium">{detail.client}</p><p className="mt-1 text-muted">{detail.title} · Website status: {detail.status}</p></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-muted">DT (H:MM)<input required pattern="[0-9]{1,4}:[0-5][0-9]" value={designTime} onChange={(event) => setDesignTime(event.target.value)} placeholder="0:00" className={`${field} placeholder:text-muted`} /></label>
        <label className="text-xs text-muted">Creative<select required value={creativeId} onChange={(event) => setCreativeId(event.target.value)} className={field}><option value="">Select creative</option>{creatives.map((creative) => <option key={creative.id} value={creative.id}>{creative.alias}</option>)}</select></label>
        <label className="text-xs text-muted">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className={field}>{manualStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      </div>
      <button type="submit" disabled={!detail || !creatives.length} className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-inset disabled:opacity-40">Add to today</button>
    </fieldset>
    {busy && <p aria-live="polite" className="mt-3 text-xs text-muted">Checking ticket…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
  </form>;
}
