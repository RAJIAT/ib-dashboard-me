import { FileCheck2 } from "lucide-react";

export function Logo({ size = 44 }: { size?: number }) {
  return (
    <div
      className="inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft"
      style={{ height: size, width: size }}
      aria-label="DocFlow Demo"
    >
      <FileCheck2 style={{ height: size * 0.55, width: size * 0.55 }} />
    </div>
  );
}
