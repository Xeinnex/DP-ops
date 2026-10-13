import { Dashboard } from "@/components/dashboard";
import { Suspense } from "react";
export default function DashboardPage() { return <Suspense fallback={<p className="text-muted">Loading daily dashboard…</p>}><Dashboard /></Suspense>; }
