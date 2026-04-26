import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useLang } from "@/i18n/LanguageProvider";
import { getCurrentUser, listRequests, type InsuranceRequest } from "@/services/api";

export const Route = createFileRoute("/agent")({
  component: AgentDashboard,
});

function AgentDashboard() {
  const { t, dir, lang } = useLang();
  const navigate = useNavigate();
  const [items, setItems] = useState<InsuranceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getCurrentUser();
    if (!u || u.role !== "agent") {
      navigate({ to: "/login" });
      return;
    }
    listRequests({ agentId: u.agentId }).then((rs) => {
      setItems(rs);
      setLoading(false);
    });
  }, [navigate]);

  const Chevron = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <DashboardShell role="agent" title={t.nav.requests}>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className={dir === "rtl" ? "text-right" : "text-left"}>
              <th className="px-5 py-3 font-semibold">{t.table.requestId}</th>
              <th className="px-5 py-3 font-semibold">{t.table.date}</th>
              <th className="px-5 py-3 font-semibold">{t.table.status}</th>
              <th className="px-5 py-3 font-semibold">{t.table.action}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">{t.table.empty}</td></tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-4 font-semibold text-foreground">{r.id}</td>
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
      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="py-8 text-center text-muted-foreground">…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t.table.empty}</p>
        ) : (
          items.map((r) => (
            <Link
              key={r.id}
              to="/requests/$id"
              params={{ id: r.id }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card active:scale-[0.99]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{r.id}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
                </div>
              </div>
              <Chevron className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
