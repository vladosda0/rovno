import { useTranslation } from "react-i18next";
import { Globe, Mail, Phone } from "lucide-react";
import type { ComponentType } from "react";
import { partyTagKind, PartyStatusBadge } from "@/components/requisites/PartyStatusTag";
import type { ContractorProfileAppearance, ContractorProfileContacts } from "@/data/contractor-profile-source";
import type { PartyCheck } from "@/hooks/use-party-status";
import { cardInitials, cardShade, shadeBackground } from "@/lib/contractor-card";
import { cn } from "@/lib/utils";
import { MaxIcon, TelegramIcon, VkIcon, WhatsappIcon, YoutubeIcon } from "./brand-icons";

/** What the card shows, whether it comes from the server or from the open form. */
export interface ContractorCardData {
  display_name: string;
  contacts: ContractorProfileContacts;
  region?: string | null;
  specializations?: string[];
  experience_years?: number | null;
  avatar_url?: string | null;
  description?: string | null;
  inn?: string | null;
  appearance: ContractorProfileAppearance;
}

export const CONTACT_ICONS: Array<[keyof ContractorProfileContacts, ComponentType<{ className?: string }>]> = [
  ["phone", Phone],
  ["email", Mail],
  ["website", Globe],
  ["telegram", TelegramIcon],
  ["whatsapp", WhatsappIcon],
  ["vk", VkIcon],
  ["max", MaxIcon],
  ["youtube", YoutubeIcon],
];

export function CardCover({ card, className, children }: { card: ContractorCardData; className?: string; children?: React.ReactNode }) {
  const coverUrl = card.appearance.cover_url;
  return (
    <div
      data-testid="card-cover"
      className={cn("relative shrink-0", className)}
      style={coverUrl ? undefined : { background: shadeBackground(cardShade(card.appearance.shade)) }}
    >
      {coverUrl ? <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent to-40%" aria-hidden="true" />
      {children}
    </div>
  );
}

export function CardMonogram({ card, className }: { card: ContractorCardData; className?: string }) {
  const shade = cardShade(card.appearance.shade);
  return (
    <div
      className={cn("absolute z-[1] grid place-items-center overflow-hidden border-4 border-white font-bold shadow-md", className)}
      style={{ backgroundColor: shade.from, color: shade.fg }}
    >
      {card.avatar_url ? <img src={card.avatar_url} alt="" className="h-full w-full object-cover" /> : cardInitials(card.display_name)}
    </div>
  );
}

export function useExperienceLine(card: ContractorCardData): string {
  const { t } = useTranslation();
  const parts: string[] = [];
  if (card.region) parts.push(card.region);
  if (card.experience_years != null) parts.push(t("contractorCard.experience", { count: card.experience_years }));
  return parts.join(" · ");
}

/** The title side of the card. Never interactive inside: its wrapper is the button. */
export function ContractorCardFace({ card, check }: { card: ContractorCardData; check: PartyCheck | null }) {
  const specs = card.specializations ?? [];
  const experience = useExperienceLine(card);
  const showTag = check?.phase !== "checking" && partyTagKind(check, card.inn ?? "");
  const icons = CONTACT_ICONS.filter(([key]) => card.contacts[key]);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-card bg-white text-foreground shadow-[0_18px_40px_-12px_rgba(14,13,6,0.28),0_2px_6px_rgba(14,13,6,0.08)]">
      <CardCover card={card} className="h-32">
        <CardMonogram card={card} className="-bottom-[30px] left-[18px] h-[68px] w-[68px] rounded-[18px] text-[22px]" />
      </CardCover>
      <div className="flex flex-col gap-[7px] px-[18px] pb-4 pt-[38px]">
        <div className="text-[19px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{card.display_name}</div>
        {showTag ? <PartyStatusBadge check={check} inn={card.inn ?? ""} className="self-start" /> : null}
        {specs.length > 0 ? <div className="text-[13.5px] text-muted-foreground">{specs.slice(0, 3).join(" · ")}</div> : null}
        {experience ? <div className="text-[13.5px] text-muted-foreground">{experience}</div> : null}
        {icons.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="card-contact-icons">
            {icons.map(([key, Icon]) => (
              <span key={key} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-foreground">
                <Icon className="h-[15px] w-[15px]" />
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
