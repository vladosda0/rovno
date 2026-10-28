import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX, type LucideIcon } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatExportDate } from "@/lib/estimate-export-data";
import type { PartyCheck } from "@/hooks/use-party-status";

type Tone = "ok" | "bad" | "neutral";

interface TagKind {
  textKey: string;
  tone: Tone;
  icon: LucideIcon;
  adviceKey: "advice" | "notFound" | "reorganizing" | null;
}

/** What the tag says for a check, or null when nothing is shown (rovno#243 frames 1, 2). */
export function partyTagKind(check: PartyCheck | null, inn: string): TagKind | null {
  if (!check || check.phase === "unavailable") return null;
  if (check.phase === "checking") {
    return { textKey: "requisites.partyStatus.checking", tone: "neutral", icon: Shield, adviceKey: null };
  }
  if (check.phase === "notFound") {
    const who = inn.trim().length === 12 ? "ip" : "org";
    return { textKey: `requisites.partyStatus.${who}.notFound`, tone: "bad", icon: ShieldQuestion, adviceKey: "notFound" };
  }
  const who = check.type === "individual" ? "ip" : "org";
  switch (check.status) {
    case "active":
      return { textKey: `requisites.partyStatus.${who}.active`, tone: "ok", icon: ShieldCheck, adviceKey: null };
    case "liquidated":
      return { textKey: `requisites.partyStatus.${who}.liquidated`, tone: "bad", icon: ShieldX, adviceKey: "advice" };
    case "liquidating":
      return { textKey: `requisites.partyStatus.${who}.liquidating`, tone: "bad", icon: ShieldX, adviceKey: "advice" };
    case "bankrupt":
      return { textKey: `requisites.partyStatus.${who}.bankrupt`, tone: "bad", icon: ShieldAlert, adviceKey: "advice" };
    case "reorganizing":
      return { textKey: "requisites.partyStatus.org.reorganizing", tone: "neutral", icon: Shield, adviceKey: "reorganizing" };
    default:
      return null;
  }
}

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  bad: "border-warning/30 bg-warning/10 text-warning",
  neutral: "border-border bg-muted text-muted-foreground",
};

interface PartyStatusTagProps {
  check: PartyCheck | null;
  inn: string;
  /** Whose INN it is: decides the advice for a bad status. */
  advice: "client" | "own";
  /** Show the registry name in the tooltip (the visitka form, frame 5). */
  showName?: boolean;
  className?: string;
}

export function PartyStatusTag({ check, inn, advice, showName, className }: PartyStatusTagProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const kind = partyTagKind(check, inn);
  if (!kind) return null;
  const Icon = kind.icon;
  const tag = (
    <button
      type="button"
      data-testid="party-status-tag"
      data-tone={kind.tone}
      className={cn(badgeVariants({ variant: "outline" }), "mt-1 gap-1 font-medium", TONE_CLASS[kind.tone], className)}
      onPointerDown={(event) => {
        // Radix closes the tooltip on press and on click; on a phone a tap must open it.
        event.preventDefault();
      }}
      onClick={(event) => {
        // A tap or Enter only opens; a press elsewhere, Escape, blur or scroll close it (rovno#243).
        event.preventDefault();
        setOpen(true);
      }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t(kind.textKey)}
    </button>
  );
  if (check?.phase !== "found" && check?.phase !== "notFound") return tag;

  const adviceText = kind.adviceKey === "advice"
    ? t(`requisites.partyStatus.advice.${advice}`)
    : kind.adviceKey
      ? t(`requisites.partyStatus.advice.${kind.adviceKey}`)
      : null;
  const checkedAt = check.phase === "found" ? check.checkedAt : new Date().toISOString();
  // Sole traders live in a separate register, EGRIP.
  const isIp = check.phase === "found" ? check.type === "individual" : inn.trim().length === 12;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{tag}</TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs text-caption">
          {showName && check.phase === "found" ? <div className="font-medium text-foreground">{check.name}</div> : null}
          <div>{t(isIp ? "requisites.partyStatus.asOfIp" : "requisites.partyStatus.asOf", { date: formatExportDate(checkedAt) })}</div>
          {adviceText ? <div className="text-muted-foreground">{adviceText}</div> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
