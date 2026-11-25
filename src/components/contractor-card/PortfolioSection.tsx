import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortfolioObject } from "@/data/contractor-portfolio-source";
import { useContractorPortfolio } from "@/hooks/use-contractor-portfolio";
import { CardSection } from "./CardSection";
import { PortfolioObjectEditor } from "./PortfolioObjectEditor";
import { PortfolioObjectViewer } from "./PortfolioObjectViewer";

/** Shown before «Показать все»: keeps the requisites close below. */
export const PORTFOLIO_PREVIEW_COUNT = 6;

export function PortfolioTile({ object, onOpen }: { object: PortfolioObject; onOpen: (tile: HTMLButtonElement) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      className="group flex min-w-0 flex-col gap-[5px] rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      data-testid="portfolio-tile"
    >
      <span className="block aspect-[4/3] w-full overflow-hidden rounded-xl bg-secondary">
        {object.photos[0] ? (
          <img
            src={object.photos[0]}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none"
          />
        ) : null}
      </span>
      <span className="line-clamp-2 text-[13px] font-medium leading-tight [overflow-wrap:anywhere]">{object.title}</span>
      <span className="text-[12px] text-muted-foreground">{t("contractorCard.portfolio.photoCount", { count: object.photos.length })}</span>
    </button>
  );
}

/** «Портфолио» in the card window: tiles of finished objects, each opens its own window. */
export function PortfolioSection({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const query = useContractorPortfolio(orgId);
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<PortfolioObject | null>(null);
  const [adding, setAdding] = useState(false);
  const openedFrom = useRef<HTMLButtonElement | null>(null);
  const objects = query.data ?? [];

  if (query.isLoading || query.isError) return null;

  if (objects.length === 0) {
    if (!canEdit) return null;
    return (
      <CardSection title={t("contractorCard.portfolio.heading")}>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4" data-testid="portfolio-empty">
          <p className="text-body-sm text-muted-foreground">{t("contractorCard.portfolio.emptyOwner")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("contractorCard.portfolio.addObject")}
          </Button>
        </div>
        <PortfolioObjectEditor orgId={orgId} object={null} open={adding} onOpenChange={setAdding} />
      </CardSection>
    );
  }

  const shown = showAll ? objects : objects.slice(0, PORTFOLIO_PREVIEW_COUNT);
  return (
    <CardSection title={t("contractorCard.portfolio.heading")}>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {shown.map((object) => (
          <PortfolioTile
            key={object.id}
            object={object}
            onOpen={(tile) => {
              openedFrom.current = tile;
              setOpened(object);
            }}
          />
        ))}
      </div>
      {objects.length > shown.length ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="self-start py-1 text-[13.5px] font-medium text-accent hover:underline"
        >
          {t("contractorCard.portfolio.showAll", { count: objects.length })}
        </button>
      ) : null}
      <PortfolioObjectViewer
        object={opened}
        returnFocusTo={openedFrom.current}
        onOpenChange={(open) => {
          if (!open) setOpened(null);
        }}
      />
    </CardSection>
  );
}
