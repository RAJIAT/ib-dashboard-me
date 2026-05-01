import { Car, ChevronDown, FileSearch, FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { DocumentRow } from "@/components/DocumentRow";
import { useLang } from "@/i18n/LanguageProvider";

type Props = {
  vehicleMedia: File[];
  setVehicleMedia: (f: File[]) => void;
  inspection: File[];
  setInspection: (f: File[]) => void;
  attachments: File[];
  setAttachments: (f: File[]) => void;
};

export function OptionalDocsSection({
  vehicleMedia,
  setVehicleMedia,
  inspection,
  setInspection,
  attachments,
  setAttachments,
}: Props) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/30 p-4 text-start transition hover:border-primary hover:bg-primary-soft/50 active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t.upload.optionalSection.openLabel}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t.upload.optionalSection.hint}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {t.upload.optionalSection.title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          ▲
        </button>
      </div>

      <DocumentRow
        icon={Car}
        label={t.upload.cards.vehiclePhotos}
        files={vehicleMedia}
        onChange={setVehicleMedia}
        onRemoveRow={() => setVehicleMedia([])}
        allowVideo
      />
      <DocumentRow
        icon={FileSearch}
        label={t.upload.cards.inspection}
        files={inspection}
        onChange={setInspection}
        onRemoveRow={() => setInspection([])}
      />
      <DocumentRow
        icon={FolderOpen}
        label={t.upload.cards.attachments}
        files={attachments}
        onChange={setAttachments}
        onRemoveRow={() => setAttachments([])}
        acceptAny
      />
    </div>
  );
}
