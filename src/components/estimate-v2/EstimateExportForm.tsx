import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ClientInfo, OrgCard } from "@/types/org-card";
import {
  type BankSuggestion,
  type PartyDetails,
  type PartySuggestion,
  lookupBanks,
  lookupParties,
  lookupPartyDetails,
} from "@/data/requisites-lookup-source";
import { RequisitesSuggestInput } from "@/components/estimate-v2/RequisitesSuggestInput";

const REQUISITES_NOTE_KEYS = {
  org: "estimate.export.profileNote",
  profile: "estimate.export.profileNoteClientShared",
  device: "estimate.export.profileNoteLookupOnly",
} as const;
export interface RequisitesLookup {
  parties: typeof lookupParties;
  partyDetails: typeof lookupPartyDetails;
  banks: typeof lookupBanks;
}

const DEFAULT_LOOKUP: RequisitesLookup = {
  parties: lookupParties,
  partyDetails: lookupPartyDetails,
  banks: lookupBanks,
};

/** How long freshly substituted fields stay highlighted (mockup frame 2). */
export const FILLED_HIGHLIGHT_MS = 60_000;

interface EstimateExportFormProps {
  orgCard: OrgCard;
  onOrgCardChange: (next: OrgCard) => void;
  clientInfo: ClientInfo;
  onClientInfoChange: (next: ClientInfo) => void;
  /** False for a plain organization member: the requisites are shown read-only. */
  canEditOrgCard?: boolean;
  /** Where the requisites live: decides which sharing note is shown. */
  requisitesScope?: "org" | "profile" | "device";
  lookup?: RequisitesLookup;
}

export function EstimateExportForm({
  orgCard,
  onOrgCardChange,
  clientInfo,
  onClientInfoChange,
  canEditOrgCard = true,
  requisitesScope = "org",
  lookup = DEFAULT_LOOKUP,
}: EstimateExportFormProps) {
  const { t } = useTranslation();
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [filledFromRegistry, setFilledFromRegistry] = useState(false);
  const [orgAddressHint, setOrgAddressHint] = useState<string | null>(null);
  const [orgIsIndividual, setOrgIsIndividual] = useState(false);
  const [lookupFailed, setLookupFailed] = useState<"org" | "client" | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const orgRef = useRef(orgCard);
  orgRef.current = orgCard;
  const clientRef = useRef(clientInfo);
  clientRef.current = clientInfo;

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  const flash = (fields: string[]) => {
    setHighlighted(new Set(fields));
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlighted(new Set()), FILLED_HIGHLIGHT_MS);
  };
  const hl = (field: string) => (highlighted.has(field) ? "border-success bg-success/10" : undefined);

  const updateOrg = <K extends keyof OrgCard>(key: K, value: OrgCard[K]) => {
    onOrgCardChange({ ...orgCard, [key]: value });
  };

  const updateClient = <K extends keyof ClientInfo>(key: K, value: ClientInfo[K]) => {
    onClientInfoChange({ ...clientInfo, [key]: value });
  };

  const searchParties = useCallback((query: string) => lookup.parties(query), [lookup]);
  const searchBanks = useCallback((query: string) => lookup.banks(query), [lookup]);

  const fetchDetails = async (item: PartySuggestion, target: "org" | "client"): Promise<PartyDetails | null> => {
    const outcome = await lookup.partyDetails(item.inn, item.kpp);
    if (outcome.status === "unavailable" || !outcome.value) {
      setLookupFailed(target);
      return null;
    }
    setLookupFailed(null);
    return outcome.value;
  };

  const pickOrgParty = async (item: PartySuggestion) => {
    const party = await fetchDetails(item, "org");
    if (!party) return;
    const current = orgRef.current;
    onOrgCardChange({
      ...current,
      legalName: party.legalName,
      inn: party.inn,
      kpp: party.kpp ?? undefined,
      ogrn: party.ogrn ?? undefined,
      legalAddress: party.addressIncomplete ? current.legalAddress : party.legalAddress ?? undefined,
      signatoryName: party.signatoryName ?? current.signatoryName,
      signatoryPosition: party.signatoryPosition ?? current.signatoryPosition,
    });
    setOrgIsIndividual(party.type === "individual");
    setOrgAddressHint(party.addressIncomplete ? party.addressHint : null);
    setFilledFromRegistry(true);
    flash(["org-legal-name", "org-inn", "org-kpp", "org-ogrn", "org-address", "org-signatory-name", "org-signatory-position"]
      .filter((field) => field !== "org-address" || !party.addressIncomplete));
  };

  const pickBank = (bank: BankSuggestion) => {
    onOrgCardChange({
      ...orgRef.current,
      bankName: bank.name,
      bik: bank.bik,
      correspondentAccount: bank.correspondentAccount ?? undefined,
    });
    flash(["org-bank", "org-bik", "org-corr"]);
  };

  const pickClientParty = async (item: PartySuggestion) => {
    const party = await fetchDetails(item, "client");
    if (!party) return;
    const current = clientRef.current;
    onClientInfoChange({
      ...current,
      isLegalEntity: true,
      name: party.legalName,
      inn: party.inn,
      address: party.addressIncomplete ? current.address : party.legalAddress ?? undefined,
      signatoryName: party.signatoryName ?? undefined,
    });
    flash(["client-name", "client-inn", "client-address", "client-signatory"]
      .filter((field) => field !== "client-address" || !party.addressIncomplete));
  };

  const partyView = (item: PartySuggestion) => ({
    key: `${item.inn}-${item.kpp ?? ""}`,
    primary: item.name,
    secondary: [t("estimate.export.lookup.innLine", { inn: item.inn }), item.address].filter(Boolean).join(" · "),
    badge: item.status === "liquidated" || item.status === "liquidating" || item.status === "bankrupt"
      ? t(`estimate.export.lookup.status.${item.status}`)
      : undefined,
  });

  const bankView = (item: BankSuggestion) => ({
    key: item.bik,
    primary: item.name,
    secondary: item.correspondentAccount
      ? t("estimate.export.lookup.bikLineWithAccount", { bik: item.bik, account: item.correspondentAccount })
      : t("estimate.export.lookup.bikLine", { bik: item.bik }),
  });

  const partyTexts = {
    listHint: t("estimate.export.lookup.partyHint"),
    notFoundText: t("estimate.export.lookup.partyNotFound"),
    unavailableText: t("estimate.export.lookup.partyUnavailable"),
  };

  const readOnly = !canEditOrgCard;
  const orgIsEmpty = !orgCard.legalName?.trim() && !orgCard.signatoryName?.trim() && !orgCard.inn?.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-caption text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t(REQUISITES_NOTE_KEYS[requisitesScope])}</span>
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          {t("estimate.export.org.heading")}
          {readOnly ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-caption font-normal text-muted-foreground">
              {t("estimate.export.org.readOnlyBadge")}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="org-legal-name">{t("estimate.export.org.legalName")} *</Label>
            <Input
              id="org-legal-name"
              value={orgCard.legalName}
              disabled={readOnly}
              className={hl("org-legal-name")}
              onChange={(e) => updateOrg("legalName", e.target.value)}
              placeholder={t("estimate.export.org.legalNamePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="org-inn">{t("estimate.export.org.inn")}</Label>
            <RequisitesSuggestInput
              id="org-inn"
              value={orgCard.inn ?? ""}
              disabled={readOnly}
              inputClassName={hl("org-inn")}
              onChange={(value) => updateOrg("inn", value || undefined)}
              search={searchParties}
              view={partyView}
              onPick={(item) => { void pickOrgParty(item); }}
              {...partyTexts}
            >
              {lookupFailed === "org" ? (
                <p className="mt-1 text-caption text-warning">{partyTexts.unavailableText}</p>
              ) : null}
            </RequisitesSuggestInput>
          </div>
          <div>
            <Label htmlFor="org-kpp">{t("estimate.export.org.kpp")}</Label>
            <Input
              id="org-kpp"
              value={orgCard.kpp ?? ""}
              disabled={readOnly}
              className={hl("org-kpp")}
              onChange={(e) => updateOrg("kpp", e.target.value || undefined)}
            />
            {orgIsIndividual && !orgCard.kpp ? (
              <p className="mt-1 text-caption text-muted-foreground">{t("estimate.export.lookup.noKpp")}</p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="org-ogrn">{t("estimate.export.org.ogrn")}</Label>
            <Input
              id="org-ogrn"
              value={orgCard.ogrn ?? ""}
              disabled={readOnly}
              className={hl("org-ogrn")}
              onChange={(e) => updateOrg("ogrn", e.target.value || undefined)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="org-address">{t("estimate.export.org.legalAddress")}</Label>
            <Input
              id="org-address"
              value={orgCard.legalAddress ?? ""}
              disabled={readOnly}
              className={hl("org-address")}
              onChange={(e) => updateOrg("legalAddress", e.target.value || undefined)}
            />
            {orgAddressHint ? (
              <p className="mt-1 text-caption text-muted-foreground">
                {t("estimate.export.lookup.ipAddress", { city: orgAddressHint })}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="org-bank">{t("estimate.export.org.bank")}</Label>
            <Input
              id="org-bank"
              value={orgCard.bankName ?? ""}
              disabled={readOnly}
              className={hl("org-bank")}
              onChange={(e) => updateOrg("bankName", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-bik">{t("estimate.export.org.bik")}</Label>
            <RequisitesSuggestInput
              id="org-bik"
              value={orgCard.bik ?? ""}
              disabled={readOnly}
              inputMode="numeric"
              inputClassName={hl("org-bik")}
              onChange={(value) => updateOrg("bik", value || undefined)}
              search={searchBanks}
              view={bankView}
              onPick={pickBank}
              listHint={t("estimate.export.lookup.bankHint")}
              notFoundText={t("estimate.export.lookup.bankNotFound")}
              unavailableText={t("estimate.export.lookup.bankUnavailable")}
            />
          </div>
          <div>
            <Label htmlFor="org-account">{t("estimate.export.org.bankAccount")}</Label>
            <Input
              id="org-account"
              value={orgCard.bankAccount ?? ""}
              disabled={readOnly}
              onChange={(e) => updateOrg("bankAccount", e.target.value || undefined)}
            />
            {!readOnly && orgCard.bik && !orgCard.bankAccount ? (
              <p className="mt-1 text-caption text-muted-foreground">{t("estimate.export.lookup.accountHint")}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="org-corr">{t("estimate.export.org.correspondentAccount")}</Label>
            <Input
              id="org-corr"
              value={orgCard.correspondentAccount ?? ""}
              disabled={readOnly}
              className={hl("org-corr")}
              onChange={(e) => updateOrg("correspondentAccount", e.target.value || undefined)}
            />
          </div>
          <div>
            <Label htmlFor="org-signatory-name">{t("estimate.export.org.signatoryName")} *</Label>
            <Input
              id="org-signatory-name"
              value={orgCard.signatoryName ?? ""}
              disabled={readOnly}
              className={hl("org-signatory-name")}
              onChange={(e) => updateOrg("signatoryName", e.target.value || undefined)}
              placeholder={t("estimate.export.org.signatoryNamePlaceholder")}
            />
          </div>
          <div>
            <Label htmlFor="org-signatory-position">{t("estimate.export.org.signatoryPosition")}</Label>
            <Input
              id="org-signatory-position"
              value={orgCard.signatoryPosition ?? ""}
              disabled={readOnly}
              className={hl("org-signatory-position")}
              onChange={(e) => updateOrg("signatoryPosition", e.target.value || undefined)}
              placeholder={t("estimate.export.org.signatoryPositionPlaceholder")}
            />
          </div>
        </div>
        {filledFromRegistry && !readOnly ? (
          <p className="mt-2 text-caption text-muted-foreground">{t("estimate.export.lookup.filledNote")}</p>
        ) : null}
        {readOnly ? (
          <p className="mt-2 text-caption text-muted-foreground">
            {orgIsEmpty ? t("estimate.export.org.emptyForMember") : t("estimate.export.org.readOnlyNote")}
          </p>
        ) : null}
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-3 text-sm font-semibold">{t("estimate.export.client.heading")}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="client-name">{t("estimate.export.client.name")} *</Label>
            <Input
              id="client-name"
              value={clientInfo.name}
              className={hl("client-name")}
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
            <>
              <div>
                <Label htmlFor="client-inn">{t("estimate.export.client.inn")}</Label>
                <RequisitesSuggestInput
                  id="client-inn"
                  value={clientInfo.inn ?? ""}
                  inputClassName={hl("client-inn")}
                  onChange={(value) => updateClient("inn", value || undefined)}
                  search={searchParties}
                  view={partyView}
                  onPick={(item) => { void pickClientParty(item); }}
                  {...partyTexts}
                >
                  {lookupFailed === "client" ? (
                    <p className="mt-1 text-caption text-warning">{partyTexts.unavailableText}</p>
                  ) : null}
                </RequisitesSuggestInput>
              </div>
              <div>
                <Label htmlFor="client-signatory">{t("estimate.export.client.signatory")}</Label>
                <Input
                  id="client-signatory"
                  value={clientInfo.signatoryName ?? ""}
                  className={hl("client-signatory")}
                  onChange={(e) => updateClient("signatoryName", e.target.value || undefined)}
                />
              </div>
            </>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="client-address">{t("estimate.export.client.address")}</Label>
            <Input
              id="client-address"
              value={clientInfo.address ?? ""}
              className={cn(hl("client-address"))}
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
