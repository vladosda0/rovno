import { useTranslation } from "react-i18next";
import { Building2, Package } from "lucide-react";
import { useActiveOrg } from "@/hooks/use-orgs";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";

export function OrgCatalogsView() {
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
      icon={Package}
      title={t("home.documentsHub.leaves.orgCatalogs.title")}
      body={t("home.documentsHub.leaves.orgCatalogs.body")}
    />
  );
}
