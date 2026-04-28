import { AlertTriangle, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useLang } from "@/i18n/LanguageProvider";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmDialog({
  open, title, body, confirmLabel, cancelLabel, destructive, onConfirm, onClose,
}: Props) {
  const { t, dir } = useLang();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4 animate-fade-in"
      dir={dir}
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-2xl bg-card shadow-elevated sm:rounded-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h2 className="text-base font-bold text-foreground">{title}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {body}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel ?? t.agents.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-soft transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
