import { Check, RefreshCw, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/i18n/LanguageProvider";

type Props = {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  optional?: boolean;
};

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoUploadCard({ label, file, onChange, optional }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = () => inputRef.current?.click();

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;

    if (!f.type.startsWith("video/")) {
      toast.error(t.upload.errors.videoBadType);
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(t.upload.errors.videoTooLarge);
      return;
    }

    onChange(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setDone(false);
    setProgress(0);

    const start = performance.now();
    const total = 1500;
    const tick = () => {
      const p = Math.min(100, ((performance.now() - start) / total) * 100);
      setProgress(p);
      if (p < 100) requestAnimationFrame(tick);
      else setDone(true);
    };
    requestAnimationFrame(tick);
  };

  const uploading = !!file && !done;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-card transition-all ${
        file ? (done ? "border-success/40" : "border-primary/40") : "border-border"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handle}
      />
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h3 className="flex items-center gap-1.5 text-base font-semibold text-foreground">
          {label}
          {optional && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t.upload.optional}
            </span>
          )}
          <span className="rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-bold text-info">
            VIDEO
          </span>
        </h3>
        {done && (
          <span className="inline-flex animate-fade-in items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
            <Check className="h-3.5 w-3.5" />
            {t.upload.uploaded}
          </span>
        )}
        {uploading && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {t.upload.progress} {Math.round(progress)}%
          </span>
        )}
      </div>

      {previewUrl ? (
        <div className="group relative mx-4 mt-3 mb-4 block aspect-[4/3] w-[calc(100%-2rem)] overflow-hidden rounded-xl bg-muted">
          <video
            src={previewUrl}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
          {file && (
            <div className="absolute bottom-0 inset-x-0 bg-foreground/60 px-2 py-1 text-[10px] font-medium text-background">
              <span className="truncate">{file.name}</span> · {formatBytes(file.size)}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-x-0 top-0 h-1 bg-foreground/10">
              <div
                className="h-full bg-primary transition-[width] duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={open}
            className="absolute top-2 end-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-soft transition hover:bg-surface"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.upload.replace}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          className="m-4 flex aspect-[4/3] w-[calc(100%-2rem)] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-primary-soft/40 text-primary transition-all hover:border-primary hover:bg-primary-soft active:scale-[0.99]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Video className="h-7 w-7" />
          </div>
          <span className="text-sm font-semibold">{t.upload.captureVideo}</span>
          <span className="text-[10px] font-medium text-muted-foreground">MP4 · MOV · WEBM · ≤ 50MB</span>
        </button>
      )}
    </div>
  );
}
