import { useState } from "react";
import { RotateCcw, Info, X } from "lucide-react";
import { toast } from "sonner";
import { resetDemo } from "@/services/demoStore";

export function DemoBanner() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const onReset = () => {
    resetDemo();
    if (typeof window !== "undefined") localStorage.removeItem("aib_auth_user");
    toast.success("Demo data reset");
    setOpen(false);
    setTimeout(() => {
      if (typeof window !== "undefined") window.location.href = "/login";
    }, 400);
  };

  return (
    <>
      <div className="sticky top-0 z-[60] flex items-center justify-between gap-2 border-b border-amber-300/60 bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
        <div className="flex min-w-0 items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Demo Mode — all data is local to this browser. Logins:
            <span className="ms-1 font-bold">admin@demo.com</span> ·
            <span className="ms-1 font-bold">supervisor@demo.com</span> ·
            <span className="ms-1 font-bold">agent@demo.com</span>
            <span className="ms-1 opacity-70">(password: demo123)</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-amber-900/10 px-2 py-1 hover:bg-amber-900/20"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
          <button
            onClick={() => setHidden(true)}
            aria-label="Hide demo banner"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-amber-900/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated">
            <h3 className="text-base font-bold text-foreground">Reset demo data?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This wipes all local requests, agents, branches, audit logs and
              the current session, then restores the original demo seed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="h-10 rounded-xl border border-border px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={onReset}
                className="h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
