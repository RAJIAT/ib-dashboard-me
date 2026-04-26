import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, FileText, X } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useLang } from "@/i18n/LanguageProvider";
import {
  getCurrentUser, getRequest, updateRequestStatus,
  type InsuranceRequest, type RequestStatus,
} from "@/services/api";

export const Route = createFileRoute("/requests/$id")({
  component: RequestDetails,
});

function RequestDetails() {
  const { t, dir, lang } = useLang();
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const [req, setReq] = useState<InsuranceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const user = getCurrentUser();
  const role = user?.role ?? "agent";

  useEffect(() => {
    if (!user) { navigate({ to: "/login" }); return; }
    getRequest(id).then((r) => { setReq(r); setLoading(false); });
  }, [id, navigate, user]);

  const setStatus = async (s: RequestStatus) => {
    if (!req) return;
    setSaving(true);
    const updated = await updateRequestStatus(req.id, s);
    setReq(updated);
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  const backTo = role === "admin" ? "/admin" : "/agent";

  return (
    <DashboardShell role={role} title={t.details.title}>
      <Link
        to={backTo}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <Back className="h-4 w-4" />
        {t.details.back}
      </Link>

      {loading || !req ? (
        <p className="py-12 text-center text-muted-foreground">…</p>
      ) : (
        <>
          {/* Top info */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold text-foreground">{req.id}</h2>
                  <StatusBadge status={req.status} />
                </div>
                <div className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-3">
                  <div><span className="font-medium text-foreground">{t.table.agent}:</span> {req.agentName}</div>
                  <div><span className="font-medium text-foreground">{t.table.branch}:</span> {req.branch}</div>
                  <div><span className="font-medium text-foreground">{t.table.date}:</span>{" "}
                    {new Date(req.createdAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB")}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{t.details.changeStatus}</span>
                <select
                  value={req.status}
                  onChange={(e) => setStatus(e.target.value as RequestStatus)}
                  disabled={saving}
                  className="h-10 rounded-xl border border-input bg-surface px-3 text-sm font-medium text-foreground"
                >
                  {(["new", "processing", "sold", "rejected", "reupload"] as RequestStatus[]).map((s) => (
                    <option key={s} value={s}>{t.status[s]}</option>
                  ))}
                </select>
                {savedFlash && <span className="text-xs font-semibold text-success">✓ {t.details.saved}</span>}
              </label>
            </div>
          </div>

          {/* Image cards */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <ImgCard label={t.details.registration} url={req.images.registration} onZoom={setZoom} />
            <ImgCard label={t.details.license} url={req.images.license} onZoom={setZoom} />
            <ImgCard label={t.details.emirates} url={req.images.emirates} onZoom={setZoom} />
          </div>

          {/* Actions */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setStatus("processing")}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-soft transition disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              {t.details.createQuote}
            </button>
            <button
              onClick={() => setStatus("sold")}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-success text-sm font-semibold text-success-foreground shadow-soft transition disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {t.details.markSold}
            </button>
            <button
              onClick={() => setStatus("reupload")}
              disabled={saving}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-purple text-sm font-semibold text-purple-foreground shadow-soft transition disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {t.details.reupload}
            </button>
          </div>
        </>
      )}

      {/* Zoom modal */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/85 p-4"
          onClick={() => setZoom(null)}
        >
          <button
            onClick={() => setZoom(null)}
            className="absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground shadow-soft"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoom} alt="Zoom" className="max-h-[90vh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </DashboardShell>
  );
}

function ImgCard({ label, url, onZoom }: { label: string; url: string; onZoom: (u: string) => void }) {
  return (
    <button
      onClick={() => onZoom(url)}
      className="group block overflow-hidden rounded-2xl border border-border bg-card text-start shadow-card"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        <img src={url} alt={label} className="h-full w-full object-cover transition group-hover:scale-105" />
      </div>
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-foreground">{label}</div>
      </div>
    </button>
  );
}
