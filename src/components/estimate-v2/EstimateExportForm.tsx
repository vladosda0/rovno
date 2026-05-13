import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { ClientInfo, OrgCard } from "@/types/org-card";

interface EstimateExportFormProps {
  orgCard: OrgCard;
  onOrgCardChange: (next: OrgCard) => void;
  clientInfo: ClientInfo;
  onClientInfoChange: (next: ClientInfo) => void;
}

export function EstimateExportForm({
  orgCard,
  onOrgCardChange,
  clientInfo,
  onClientInfoChange,
}: EstimateExportFormProps) {
  const { t } = useTranslation();

  const updateOrg = <K extends keyof OrgCard>(key: K, value: OrgCard[K]) => {
    onOrgCardChange({ ...orgCard, [key]: value });
  };

  const updateClient = <K extends keyof ClientInfo>(key: K, value: ClientInfo[K]) => {
    onClientInfoChange({ ...clientInfo, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-caption text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("estimate.export.profileNote")}</span>
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-3 text-sm font-semibold">{t("estimate.export.org.heading")}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="org-legal-name">{t("estimate.export.org.legalName")} *</Label>
            <Input
              id="org-legal-name"
              value={orgCard.legalName}
              onChange={(e) => updateOrg("legalName", e.target.value)}
              placeholder={t("estimate.export.org.legalNamePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="org-inn">{t("estimate.export.org.inn")}</Label>
            <Input
              id="org-inn"
              value={orgCard.inn ?? ""}
              onChange={(e) => updateOrg("inn", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-kpp">{t("estimate.export.org.kpp")}</Label>
            <Input
              id="org-kpp"
              value={orgCard.kpp ?? ""}
              onChange={(e) => updateOrg("kpp", e.target.value || undefined)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="org-address">{t("estimate.export.org.legalAddress")}</Label>
            <Input
              id="org-address"
              value={orgCard.legalAddress ?? ""}
              onChange={(e) => updateOrg("legalAddress", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-bank">{t("estimate.export.org.bank")}</Label>
            <Input
              id="org-bank"
              value={orgCard.bankName ?? ""}
              onChange={(e) => updateOrg("bankName", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-bik">{t("estimate.export.org.bik")}</Label>
            <Input
              id="org-bik"
              value={orgCard.bik ?? ""}
              onChange={(e) => updateOrg("bik", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-account">{t("estimate.export.org.bankAccount")}</Label>
            <Input
              id="org-account"
              value={orgCard.bankAccount ?? ""}
              onChange={(e) => updateOrg("bankAccount", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-corr">{t("estimate.export.org.correspondentAccount")}</Label>
            <Input
              id="org-corr"
              value={orgCard.correspondentAccount ?? ""}
              onChange={(e) => updateOrg("correspondentAccount", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-signatory-name">{t("estimate.export.org.signatoryName")} *</Label>
            <Input
              id="org-signatory-name"
              value={orgCard.signatoryName ?? ""}
              onChange={(e) => updateOrg("signatoryName", e.target.value || undefined)}
              placeholder={t("estimate.export.org.signatoryNamePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="org-signatory-position">{t("estimate.export.org.signatoryPosition")}</Label>
            <Input
              id="org-signatory-position"
              value={orgCard.signatoryPosition ?? ""}
              onChange={(e) => updateOrg("signatoryPosition", e.target.value || undefined)}
              placeholder={t("estimate.export.org.signatoryPositionPlaceholder")}
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-3 text-sm font-semibold">{t("estimate.export.client.heading")}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="client-name">{t("estimate.export.client.name")} *</Label>
            <Input
              id="client-name"
              value={clientInfo.name}
              onChange={(e) => updateClient("name", e.target.value)}
              placeholder={t("estimate.export.client.namePlaceholder")}
            />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <Checkbox
              id="client-is-legal"
              checked={clientInfo.isLegalEntity ?? false}
              onCheckedChange={(checked) => updateClient("isLegalEntity", checked === true)}
            />
            <Label htmlFor="client-is-legal" className="cursor-pointer text-sm">
              {t("estimate.export.client.isLegalEntity")}
            </Label>
          </div>
          {clientInfo.isLegalEntity ? (
            <div>
              <Label htmlFor="client-inn">{t("estimate.export.client.inn")}</Label>
              <Input
                id="client-inn"
                value={clientInfo.inn ?? ""}
                onChange={(e) => updateClient("inn", e.target.value || undefined)}
              />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="client-address">{t("estimate.export.client.address")}</Label>
            <Input
              id="client-address"
              value={clientInfo.address ?? ""}
              onChange={(e) => updateClient("address", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="client-phone">{t("estimate.export.client.phone")}</Label>
            <Input
              id="client-phone"
              value={clientInfo.phone ?? ""}
              onChange={(e) => updateClient("phone", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="client-email">{t("estimate.export.client.email")}</Label>
            <Input
              id="client-email"
              type="email"
              value={clientInfo.email ?? ""}
              onChange={(e) => updateClient("email", e.target.value || undefined)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
