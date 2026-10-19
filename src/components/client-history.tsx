"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientRecord } from "@/types/operations";
import type { Ticket } from "@/types/ticket";

interface History { from: string; through: string; total: number; entries: (Ticket & { day: string })[] }

export function ClientHistory({ client, onClose }: { client: ClientRecord; onClose: () => void }) {
  const modal = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    modal.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/client-history?clientId=${encodeURIComponent(client.id)}&page=${page}`, { signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setHistory(body); setError("");
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [client.id, page]);

  return <dialog ref={modal} aria-labelledby="client-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-6xl overflow-auto rounded-xl border border-line bg-panel p-4 text-ink backdrop:bg-black/70 sm:p-6">
    <header className="mb-4 flex items-start justify-between gap-4"><div><h2 id="client-history-title" className="text-lg font-semibold text-lime">{client.name} — history</h2><p className="mt-1 text-xs text-muted">Past two months · newest first · all statuses{history ? ` · ${history.total} entries (${history.from} to ${history.through})` : ""}</p></div><button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm">Close</button></header>
    {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
    {!history && !error && <p className="text-sm text-muted">Loading history…</p>}
    {history && <><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-inset text-xs text-muted"><tr>{["Activity date", "Ticket", "Description", "Creative", "Status", "DT"].map(label => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{history.entries.map(ticket => <tr key={`${ticket.day}:${ticket.entryId}:${ticket.assignee}`} className="border-t border-line">
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{ticket.day}{ticket.observedAt && <span className="mt-1 block text-[10px]">{new Date(ticket.observedAt).toLocaleTimeString([], { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })}</span>}</td>
      <td className="px-3 py-2"><a href={ticket.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue hover:underline">#{ticket.id}</a><span className="mt-1 block text-[10px] text-muted">{ticket.independentManual ? "Manual entry" : (ticket.occurrence || 1) > 1 ? `Entry ${ticket.occurrence}` : ""}</span></td>
      <td className="max-w-xs px-3 py-2">{ticket.title}</td><td className="px-3 py-2 text-muted">{ticket.assignee || "Not assigned"}</td><td className="px-3 py-2 text-xs">{ticket.status}</td><td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{ticket.designTime || "0:00"}</td>
    </tr>)}</tbody></table></div>{!history.entries.length && <p className="py-6 text-sm text-muted">No saved tickets for this client in the past two months.</p>}<div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted"><button disabled={page === 1} onClick={() => { setHistory(null); setPage(page - 1); }} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={page * 50 >= history.total} onClick={() => { setHistory(null); setPage(page + 1); }} className="rounded-lg border border-line px-3 py-2 disabled:opacity-40">Next</button></div></>}
  </dialog>;
}
