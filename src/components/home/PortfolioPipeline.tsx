import { useTranslation } from "react-i18next";

import { formatCompactMoney } from "@/lib/estimate-v2/format-money";
import type { PortfolioPipeline as PortfolioPipelineData } from "@/lib/finance/portfolio-read-model";

interface Props {
  pipeline: PortfolioPipelineData;
  currency: string;
}

export function PortfolioPipeline({ pipeline, currency }: Props) {
  const { t } = useTranslation();
  const money = (cents: number) => formatCompactMoney(cents, currency);

  const columns = [
    { key: "planning", label: t("financeTab.pipelinePlanning"), bucket: pipeline.planning },
    { key: "in_work", label: t("financeTab.pipelineInWork"), bucket: pipeline.inWork },
    { key: "finished", label: t("financeTab.pipelineFinished"), bucket: pipeline.finished },
  ];

  return (
    <div>
      <h3 className="mb-2 text-[15px] font-medium text-foreground">{t("financeTab.pipeline")}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {columns.map((column) => (
          <div key={column.key} className="rounded-md bg-muted/30 px-3 py-2">
            <p className="text-[15px] text-muted-foreground">{column.label}</p>
            <p className="text-2xl font-medium tabular-nums text-foreground">
              {t("financeTab.pipelineCount", { count: column.bucket.count })}
            </p>
            <p className="text-[13px] text-muted-foreground tabular-nums">{money(column.bucket.contractValueCents)}</p>
            {column.bucket.backlogCents !== undefined && (
              <p className="text-[13px] text-muted-foreground tabular-nums">
                {t("financeTab.pipelineBacklog", { value: money(column.bucket.backlogCents) })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
