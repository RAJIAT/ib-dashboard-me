import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, TrendingUp, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useLang } from "@/i18n/LanguageProvider";
import {
  getCurrentUser, listRequests, listAgents, listBranches,
  type InsuranceRequest, type RequestStatus,
} from "@/services/api";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { t, dir, lang } = useLang();
  const navigate = useNavigate();
  const [items, setItems] = useState<InsuranceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [agentF, setAgentF] = useState("");
  const [branchF, setBranchF] = useState("");
  const [statusF, setStatusF] = useState<"" | RequestStatus>("");
  const [dateF, setDateF] = useState("");

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || u.role !== "admin") {
      navigate({ to: "/login" });
      return;
    }
    listRequests().then((rs) => { setItems(rs); setLoading(false); });
  }, [navigate]);

  const filtered = useMemo(
    () =>
      items.filter((r) => {
        if (agentF && r.agentId !== agentF) return false;
        if (branchF && r.branch !== branchF) return false;
        if (statusF && r.status !== statusF) return false;
        if (dateF && !r.createdAt.startsWith(dateF)) return false;
        return true;
      }),
    [items, agentF, branchF, statusF, dateF],
  );

  const stats = useMemo(
    () => ({
      total: items.length,
      newReq: items.filter((r) => r.status === "new").length,
      sales: items.filter((r) => r.status === "sold").length,
    }),
    [items],
  );

  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;
  const reset = () => { setAgentF(""); setBranchF(""); setStatusF(""); setDateF(""); };

  return (
    <DashboardShell role="admin" title={t.admin.title}>
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.admin.total} value={stats.total} icon={<FileText className="h-5 w-5" />} tone="primary" />
        <StatCard label={t.admin.newReq} value={stats.newReq} icon={<Sparkles className="h-5 w-5" />} tone="info" />
        <StatCard label={t.admin.sales} value={stats.sales} icon={<TrendingUp className="h-5 w-5" />} tone="success" />
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={agentF} onChange={setAgentF} label={t.admin.filterAgent} all={t.admin.all}
            options={listAgents().map((a) => ({ value: a.id, label: a.name }))} />
          <Select value={branchF} onChange={setBranchF} label={t.admin.filterBranch} all={t.admin.all}
            options={listBranches().map((b) => ({ value: b, label: b }))} />
          <Select value={statusF} onChange={(v) => setStatusF(v as RequestStatus | "")} label={t.admin.filterStatus} all={t.admin.all}
            options={(["new", "processing", "sold", "rejected", "reupload"] as RequestStatus[]).map((s) => ({ value: s, label: t.status[s] }))} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{t.admin.filterDate}</span>
            <input
              type="date"
              value={dateF}
              onChange={(e) => setDateF(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
            />
          </label>
          <button
            onClick={reset}
            className="h-11 self-end rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {t.admin.reset}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className={dir === "rtl" ? "text-right" : "text-left"}>
              <th className="px-5 py-3 font-semibold">{t.table.requestId}</th>
              <th className="px-5 py-3 font-semibold">{t.table.agent}</th>
              <th className="px-5 py-3 font-semibold">{t.table.branch}</th>
              <th className="px-5 py-3 font-semibold">{t.table.date}</th>
              <th className="px-5 py-3 font-semibold">{t.table.status}</th>
              <th className="px-5 py-3 font-semibold">{t.table.action}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">{t.table.empty}</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-4 font-semibold text-foreground">{r.id}</td>
                  <td className="px-5 py-4 text-foreground">{r.agentName}</td>
                  <td className="px-5 py-4 text-muted-foreground">{r.branch}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-4">
                    <Link
                      to="/requests/$id"
                      params={{ id: r.id }}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft/70"
                    >
                      {t.table.view} <Chevron className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mt-6 space-y-3 md:hidden">
        {filtered.map((r) => (
          <Link
            key={r.id}
            to="/requests/$id"
            params={{ id: r.id }}
            className="block rounded-2xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">{r.id}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-2 text-sm text-foreground">{r.agentName}</div>
            <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{r.branch}</span>
              <span>{new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}</span>
            </div>
          </Link>
        ))}
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label, value, icon, tone,
}: { label: string; value: number; icon: React.ReactNode; tone: "primary" | "info" | "success" }) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function Select({
  value, onChange, label, all, options,
}: {
  value: string; onChange: (v: string) => void; label: string; all: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
      >
        <option value="">{all}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
