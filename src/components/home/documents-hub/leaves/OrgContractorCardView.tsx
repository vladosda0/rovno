import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, IdCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useActiveOrg } from "@/hooks/use-orgs";
import { useContractorProfile } from "@/hooks/use-contractor-profile";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";
import { ContractorCard } from "@/components/contractor-card/ContractorCard";
import { useCardRegistry } from "@/components/contractor-card/use-card-registry";
import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";
import type { ContractorProfile } from "@/data/contractor-profile-source";

function SavedCard({ profile, canEdit, onEdit }: { profile: ContractorProfile; canEdit: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  const { check, details } = useCardRegistry(profile.inn);
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-h3 text-foreground">{t("home.documentsHub.leaves.orgContractorCard.title")}</h3>
            <p className="text-body-sm text-muted-foreground">
              {t(canEdit ? "contractorCard.subtitleOwner" : "contractorCard.subtitleMember")}
            </p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" onClick={onEdit} className="max-sm:hidden" data-testid="card-edit-top">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t("home.documentsHub.leaves.orgContractorCard.editButton")}
            </Button>
          ) : null}
        </div>
        <ContractorCard
          card={profile}
          check={check}
          details={details}
          onEdit={canEdit ? onEdit : undefined}
          portfolio={{ orgId: profile.org_id, canEdit }}
          ariaLabel={t("contractorCard.openAria", { name: profile.display_name })}
          className="pb-2 pt-4"
        />
        <p className="text-center text-caption text-muted-foreground">{t("contractorCard.openHint")}</p>
        {canEdit ? (
          <Button type="button" onClick={onEdit} className="w-full sm:hidden" data-testid="card-edit-bottom">
            {t("home.documentsHub.leaves.orgContractorCard.editButton")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GhostCard() {
  return (
    <div className="w-[300px] max-w-full overflow-hidden rounded-card bg-white opacity-75 shadow-md" aria-hidden="true">
      <div className="h-20 bg-gradient-to-r from-muted to-secondary" />
      <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-7">
        <div className="h-2.5 w-3/5 rounded bg-muted" />
        <div className="h-2.5 w-2/5 rounded bg-muted" />
        <div className="h-2.5 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}

export function OrgContractorCardView() {
  const { t } = useTranslation();
  const activeOrg = useActiveOrg();
  const [formOpen, setFormOpen] = useState(false);
  const profileQuery = useContractorProfile(activeOrg?.id);

  if (!activeOrg) {
    return (
      <EmptyState
        icon={Building2}
        title={t("home.documentsHub.empty.noOrg.title")}
        body={t("home.documentsHub.empty.noOrg.description")}
      />
    );
  }

  const canEdit = activeOrg.role === "owner" || activeOrg.role === "admin";
  const profile = profileQuery.data ?? null;

  return (
    <>
      {profileQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-body-sm text-muted-foreground">{t("common.loading")}</CardContent>
        </Card>
      ) : profile ? (
        <SavedCard profile={profile} canEdit={canEdit} onEdit={() => setFormOpen(true)} />
      ) : profileQuery.isError ? (
        <EmptyState icon={IdCard} title={t("contractorCard.loadFailed")} />
      ) : canEdit ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <GhostCard />
            <h3 className="text-body font-semibold text-foreground">{t("contractorCard.emptyOwner")}</h3>
            <Button type="button" onClick={() => setFormOpen(true)}>{t("home.documentsHub.cta.createVisitka")}</Button>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={IdCard} title={t("contractorCard.emptyMember")} />
      )}
      {canEdit ? <MultiStepUploadModal open={formOpen} onOpenChange={setFormOpen} presetType="visitka" closeOnBack /> : null}
    </>
  );
}
