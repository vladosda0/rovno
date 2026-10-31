import { useTranslation } from "react-i18next";
import { Globe, Mail, Phone, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PartyStatusBadge, PartyStatusTag, partyTagKind } from "@/components/requisites/PartyStatusTag";
import type { ContractorProfileContacts } from "@/data/contractor-profile-source";
import type { PartyDetails } from "@/data/requisites-lookup-source";
import { toast } from "@/hooks/use-toast";
import type { PartyCheck } from "@/hooks/use-party-status";
import { linkLabel, mailLink, requisiteLines, telLink, telegramLink, webLink, whatsappLink } from "@/lib/contractor-card";
import { formatExportDate } from "@/lib/estimate-export-data";
import { MaxIcon, TelegramIcon, VkIcon, WhatsappIcon, YoutubeIcon } from "./brand-icons";
import { CardCover, CardMonogram, useExperienceLine, type ContractorCardData } from "./ContractorCardFace";

interface LinkRowSpec {
  key: keyof ContractorProfileContacts;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  href: (value: string) => string | null;
  text?: (value: string) => string;
}

const CONTACT_ROWS: LinkRowSpec[] = [
  { key: "phone", labelKey: "contractorCard.contacts.phone", Icon: Phone, href: telLink },
  { key: "email", labelKey: "contractorCard.contacts.email", Icon: Mail, href: mailLink },
  { key: "website", labelKey: "contractorCard.contacts.website", Icon: Globe, href: webLink, text: linkLabel },
];

const SOCIAL_ROWS: LinkRowSpec[] = [
  { key: "telegram", labelKey: "contractorCard.contacts.telegram", Icon: TelegramIcon, href: telegramLink, text: linkLabel },
  { key: "whatsapp", labelKey: "contractorCard.contacts.whatsapp", Icon: WhatsappIcon, href: whatsappLink },
  { key: "vk", labelKey: "contractorCard.contacts.vk", Icon: VkIcon, href: webLink, text: linkLabel },
  { key: "max", labelKey: "contractorCard.contacts.max", Icon: MaxIcon, href: webLink, text: linkLabel },
  { key: "youtube", labelKey: "contractorCard.contacts.youtube", Icon: YoutubeIcon, href: webLink, text: linkLabel },
];

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

const ROWS_CLASS = "flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border";

function LinkRows({ specs, contacts }: { specs: LinkRowSpec[]; contacts: ContractorProfileContacts }) {
  const { t } = useTranslation();
  const filled = specs.filter((spec) => contacts[spec.key]);
  if (filled.length === 0) return null;
  return (
    <div className={ROWS_CLASS}>
      {filled.map(({ key, labelKey, Icon, href, text }) => {
        const value = contacts[key] as string;
        const link = href(value);
        const label = text ? text(value) : value;
        return (
          <div key={key} className="flex min-w-0 items-center gap-3 px-3 py-2.5 text-body-sm">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="w-[84px] shrink-0 text-muted-foreground">{t(labelKey)}</span>
            {link ? (
              <a
                href={link}
                {...(link.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="min-w-0 truncate font-medium text-accent hover:underline"
              >
                {label}
              </a>
            ) : (
              <span className="min-w-0 truncate font-medium">{label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function registryStatusLine(check: PartyCheck | null, t: (key: string, options?: Record<string, unknown>) => string): string | null {
  if (check?.phase !== "found") return null;
  const isIp = check.type === "individual";
  const who = isIp ? "ip" : "org";
  const status = check.status === "active"
    ? t(`contractorCard.requisites.active.${who}`)
    : t(partyTagKind(check, "")?.textKey ?? "contractorCard.requisites.unknown");
  const asOf = t(isIp ? "requisites.partyStatus.asOfIp" : "requisites.partyStatus.asOf", { date: formatExportDate(check.checkedAt) });
  return `${status} · ${asOf.charAt(0).toLowerCase()}${asOf.slice(1)}`;
}

export function ContractorCardWindow({
  card,
  check,
  details,
  onEdit,
}: {
  card: ContractorCardData;
  check: PartyCheck | null;
  details: PartyDetails | null;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const experience = useExperienceLine(card);
  const specs = card.specializations ?? [];
  const inn = card.inn?.trim() ?? "";
  const showRequisites = Boolean(inn) && card.appearance.show_requisites !== false;
  const lines = showRequisites ? requisiteLines(inn, details) : [];
  const statusLine = showRequisites ? registryStatusLine(check, t) : null;
  const hasContacts = CONTACT_ROWS.some((spec) => card.contacts[spec.key]);
  const hasSocial = SOCIAL_ROWS.some((spec) => card.contacts[spec.key]);

  async function copyRequisites() {
    const text = lines
      .map((line) => `${t(`contractorCard.requisites.${line.key}`)}: ${line.value}`)
      .concat(statusLine ? [statusLine] : [])
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("contractorCard.requisites.copied") });
    } catch {
      toast({ title: t("contractorCard.requisites.copyFailed"), variant: "destructive" });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card text-foreground sm:rounded-modal">
      <CardCover card={card} className="h-[150px] sm:h-[168px]">
        <DialogPrimitive.Close
          aria-label={t("common.close")}
          className="absolute right-3.5 top-3.5 z-[2] grid h-9 w-9 place-items-center rounded-full bg-white/85 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </DialogPrimitive.Close>
        <CardMonogram card={card} className="-bottom-[38px] left-6 h-[84px] w-[84px] rounded-[22px] border-card text-[27px]" />
      </CardCover>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[18px] pb-2 pt-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <DialogPrimitive.Title className="text-[23px] font-bold tracking-tight [overflow-wrap:anywhere]">{card.display_name}</DialogPrimitive.Title>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
            <PartyStatusTag check={check?.phase === "checking" ? null : check} inn={inn} advice="own" showName className="mt-0" tooltipClassName="z-[70]" />
            {experience ? <span>{experience}</span> : null}
          </div>
        </div>
        {card.description ? (
          <Section title={t("contractorCard.about")}>
            <p className="whitespace-pre-line text-body-sm [overflow-wrap:anywhere]">{card.description}</p>
          </Section>
        ) : null}
        {specs.length > 0 ? (
          <Section title={t("contractorCard.specializations")}>
            <div className="flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <span key={spec} className="max-w-full rounded-pill bg-secondary px-3 py-1 text-[13px] [overflow-wrap:anywhere]">{spec}</span>
              ))}
            </div>
          </Section>
        ) : null}
        {hasContacts ? (
          <Section title={t("contractorCard.contactsHeading")}>
            <LinkRows specs={CONTACT_ROWS} contacts={card.contacts} />
          </Section>
        ) : null}
        {hasSocial ? (
          <Section title={t("contractorCard.socialHeading")}>
            <LinkRows specs={SOCIAL_ROWS} contacts={card.contacts} />
          </Section>
        ) : null}
        {showRequisites ? (
          <Section
            title={t("contractorCard.requisitesHeading")}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void copyRequisites()}>
                {t("contractorCard.requisites.copy")}
              </Button>
            }
          >
            <div className={ROWS_CLASS} data-testid="card-requisites">
              {lines.map((line) => (
                <div key={line.key} className="flex flex-col px-3 py-2.5">
                  <span className="text-caption text-muted-foreground">{t(`contractorCard.requisites.${line.key}`)}</span>
                  <span className="text-body-sm font-medium [overflow-wrap:anywhere]">{line.value}</span>
                </div>
              ))}
              {statusLine ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-caption text-muted-foreground">{t("contractorCard.requisites.status")}</span>
                    <span className="text-body-sm font-medium">{statusLine}</span>
                  </div>
                  <PartyStatusBadge check={check} inn={inn} className="mt-0 shrink-0" />
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}
      </div>
      {onEdit ? (
        <div className="flex gap-2.5 border-t border-border bg-card px-4 pb-6 pt-3 sm:px-6 sm:pb-5 sm:pt-3.5">
          <Button type="button" onClick={onEdit}>{t("home.documentsHub.leaves.orgContractorCard.editButton")}</Button>
        </div>
      ) : null}
    </div>
  );
}
