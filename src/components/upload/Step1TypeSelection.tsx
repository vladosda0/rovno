import { useTranslation } from "react-i18next";
import { FileText, Package, FileSpreadsheet, IdCard, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { UploadType } from "@/components/upload/types";

interface TypeCard {
  type: UploadType;
  icon: LucideIcon;
}

const TYPE_CARDS: TypeCard[] = [
  { type: "document", icon: FileText },
  { type: "catalog", icon: Package },
  { type: "estimate_template", icon: FileSpreadsheet },
  { type: "visitka", icon: IdCard },
];

export interface Step1TypeSelectionProps {
  onSelect: (type: UploadType) => void;
}

export function Step1TypeSelection({ onSelect }: Step1TypeSelectionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
      {TYPE_CARDS.map(({ type, icon: Icon }) => (
        <Card
          key={type}
          role="button"
          tabIndex={0}
          aria-label={t(`upload.modal.step1.types.${type}.title`)}
          onClick={() => onSelect(type)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(type);
            }
          }}
          className="cursor-pointer transition hover:border-accent/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CardContent className="flex items-start gap-3 p-4">
            <div className="rounded-lg bg-accent/15 p-2.5 text-accent shrink-0">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-body font-semibold text-foreground">
                {t(`upload.modal.step1.types.${type}.title`)}
              </h3>
              <p className="text-caption text-muted-foreground">
                {t(`upload.modal.step1.types.${type}.subtitle`)}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
