import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Building2, IdCard } from "lucide-react";
import { useActiveOrg } from "@/hooks/use-orgs";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";

export function OrgContractorCardView() {
  const { t } = useTranslation();
  const activeOrg = useActiveOrg();

  if (!activeOrg) {
    return (
      <EmptyState
        icon={Building2}
        title={t("home.documentsHub.empty.noOrg.title")}
        body={t("home.documentsHub.empty.noOrg.description")}
      />
    );
  }

  return (
    <EmptyState
      icon={IdCard}
      title={t("home.documentsHub.leaves.orgContractorCard.title")}
      body={t("home.documentsHub.leaves.orgContractorCard.body")}
      cta={
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-block">
              <Button disabled>{t("home.documentsHub.leaves.orgContractorCard.editButton")}</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {t("home.documentsHub.leaves.orgContractorCard.disabledTooltip")}
          </TooltipContent>
        </Tooltip>
      }
    />
  );
}
