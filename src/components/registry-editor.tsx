"use client";
import { useEffect, useState } from "react";
import type { Registry, ClientRecord, CreativeRecord } from "@/types/operations";
import { signedTime } from "@/lib/daily";
import { QueueLink } from "@/components/queue-link";
import { clientTicketsUrl, creativeTicketsUrl } from "@/lib/queue-links";
import { availabilityOptions, effectiveCapacity } from "@/lib/availability";

export function RegistryEditor({ kind }: { kind: "clients" | "creatives" }) {
  const [data, setData] = useState<Registry | null>(null);
  const [editing, setEditing] = useState(false);
  const [existing, setExisting] = useState(false);
  const [id, setId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [minutes, setMinutes] = useState("120");
  const [pc, setPc] = useState("NO PC");
  const [scopes, setScopes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/registry").then((response) => response.json()).then(setData).catch(() => setError("Unable to load records.")); }, []);
  function edit(record?: ClientRecord | CreativeRecord) {
    setExisting(Boolean(record)); setEditing(true); setError("");
    setId(record?.id || ""); setName(record?.name || "");
    setQueueId(record ? "alias" in record ? record.designerId || "" : record.companyId || record.id : "");
    if (record && "alias" in record) { setAlias(record.alias); setScopes(record.scopes); setMinutes(String(record.capacityMinutes)); }
    else { setAlias(""); setScopes([]); setMinutes(String(record && "dailyMinutes" in record ? record.dailyMinutes : kind === "clients" ? 120 : 405)); }
    setPc(record && "pc" in record ? record.pc : "NO PC");
  }
  async function mutate(body: object) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/registry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setData(result); setEditing(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }
  const inputClass = "mt-2 block w-full rounded-lg border border-line bg-inset px-3 py-2 text-ink";
  return <div className="space-y-6"><div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold text-lime">{kind === "clients" ? "Clients DB" : "Creatives DB"}</h1><p className="mt-3 text-muted">Edit your persistent {kind === "clients" ? "client subscriptions and daily allocation" : "team names, aliases, scopes and bandwidth"}.</p></div><button onClick={() => edit()} className="rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-inset">Add {kind === "clients" ? "client" : "creative"}</button></div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {editing && <form className="grid gap-4 rounded-xl border border-line bg-panel p-6 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void mutate({ kind, id: kind === "creatives" && !existing ? crypto.randomUUID() : kind === "clients" && !existing ? queueId.trim() : id.trim(), companyId: kind === "clients" ? queueId.trim() : undefined, designerId: kind === "creatives" ? queueId.trim() : undefined, name, alias, scopes, dailyMinutes: Number(minutes), capacityMinutes: Number(minutes), pc }); }}>
      <label className="text-sm text-muted">{kind === "clients" ? "Company ID" : "Designer ID (optional)"}<input required={kind === "clients"} pattern="[0-9]+" inputMode="numeric" value={queueId} onChange={(event) => setQueueId(event.target.value)} className={inputClass} /><span className="mt-1 block text-xs">Used to link to the website queue.</span></label>
      <label className="text-sm text-muted">{kind === "clients" ? "Client name (match website)" : "Full website name"}<input required value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
      {kind === "creatives" && <label className="text-sm text-muted">Display alias<input required value={alias} onChange={(event) => setAlias(event.target.value)} className={inputClass} /></label>}
      <label className="text-sm text-muted">{kind === "clients" ? "Daily DT" : "Full-day bandwidth"} (minutes)<input type="number" required min={kind === "clients" ? 0 : 1} step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} className={inputClass} /><span className="mt-1 block text-xs">{signedTime(Number(minutes) || 0)} hours:minutes</span></label>
      {kind === "clients" ? <label className="text-sm text-muted">Production Coordinator<select value={pc} onChange={(event) => setPc(event.target.value)} className={inputClass}>{["NO PC", "PC", "PC AD"].map((value) => <option key={value}>{value}</option>)}</select></label> : <fieldset className="sm:col-span-2"><legend className="text-sm text-muted">Scopes</legend><div className="mt-3 flex flex-wrap gap-4">{["GD", "PD", "FIG", "CI", "MG", "VE"].map((scope) => <label key={scope} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes(event.target.checked ? [...scopes, scope] : scopes.filter((value) => value !== scope))} />{scope}</label>)}</div></fieldset>}
      <div className="flex gap-3 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-lime px-4 py-2 font-medium text-inset">{busy ? "Saving…" : "Save record"}</button><button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-4 py-2">Cancel</button></div>
    </form>}
    {!data && <p className="text-muted">Loading database…</p>}
    <div className="space-y-3">{data?.[kind].map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel p-5"><div><p className="font-medium"><QueueLink href={"alias" in record ? creativeTicketsUrl(record.designerId) : clientTicketsUrl(record.companyId || record.id)}>{"alias" in record ? record.alias : record.name}</QueueLink></p><p className="mt-1 text-sm text-muted">{"alias" in record ? `${record.name} · Designer ID ${record.designerId || "not set"} · ${record.scopes.join(" + ")} · BW ${signedTime(effectiveCapacity(record))} · ${availabilityOptions.find((option) => option.value === (record.availability || "available"))?.label}` : `ID ${record.companyId || record.id} · ${signedTime(record.dailyMinutes)} daily DT · ${record.pc}`}</p></div><div className="flex gap-3"><button disabled={busy} onClick={() => edit(record)} className="rounded-lg border border-line px-3 py-2 text-sm">Edit</button><button disabled={busy} onClick={() => { if (window.confirm(`Remove ${record.name} from the active registry? Saved ticket history will remain.`)) void mutate({ kind, id: record.id, action: "delete" }); }} className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300">Remove</button></div></div>)}</div>
    <p className="text-xs text-muted">Removing a record preserves ticket history. Removing a client excludes it from future client queue fetches. Matching uses the full website name; aliases are display names.</p>
  </div>;
}
