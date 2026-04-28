import { Camera, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/i18n/LanguageProvider";

type Props = {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  optional?: boolean;
};

export function MultiUploadCard({ label, files, onChange, max = 6, optional }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();
  const [previews, setPreviews] = useState<string[]>([]);

  // Rebuild previews whenever files change.
  useEffect(() => {
    const urls = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
    );
    setPreviews(urls);
    return () => {
      urls.forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [files]);

  const open = () => inputRef.current?.click();

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (list.length === 0) return;
    const room = Math.max(0, max - files.length);
    onChange([...files, ...list.slice(0, room)]);
    e.target.value = "";
  };

  const remove = (idx: number) => {
    const next = files.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const canAddMore = files.length < max;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card shadow-card transition ${
        files.length > 0 ? "border-primary/40" : "border-border"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={handle}
      />
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h3 className="text-base font-semibold text-foreground">
          {label}
          {optional && (
            <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t.upload.optional}
            </span>
          )}
        </h3>
        {files.length > 0 && (
          <span className="text-xs font-semibold text-muted-foreground">
            {files.length}/{max}
          </span>
        )}
      </div>

      {files.length === 0 ? (
        <button
          type="button"
          onClick={open}
          className="m-4 flex aspect-[4/3] w-[calc(100%-2rem)] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-primary-soft/40 text-primary transition hover:border-primary hover:bg-primary-soft active:scale-[0.99]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Camera className="h-7 w-7" />
          </div>
          <span className="text-sm font-semibold">{t.upload.capture}</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 p-4">
          {previews.map((src, idx) => (
            <div key={idx} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
              {src ? (
                <img src={src} alt={`${label} ${idx + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  {files[idx]?.name?.slice(0, 8) ?? "—"}
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={t.upload.removePhoto}
                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background transition hover:bg-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {canAddMore && (
            <button
              type="button"
              onClick={open}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border bg-primary-soft/40 text-primary transition hover:border-primary hover:bg-primary-soft"
            >
              <Plus className="h-5 w-5" />
              <span className="text-[10px] font-semibold">{t.upload.addPhoto}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
