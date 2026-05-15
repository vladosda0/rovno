import { useTranslation } from "react-i18next";
import { Building2 } from "lucide-react";
import { useActiveOrg } from "@/hooks/use-orgs";
import { EstimateTemplatesTab } from "@/components/home/EstimateTemplatesTab";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";

export function OrgEstimatesView() {
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

  // RLS already filters templates to those the user can read; the visible
  // set will include the active org's own templates plus system canonicals.
  return <EstimateTemplatesTab />;
}
