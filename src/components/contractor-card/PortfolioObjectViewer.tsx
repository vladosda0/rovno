import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PortfolioObject } from "@/data/contractor-portfolio-source";
import { cn } from "@/lib/utils";

const SWIPE_PX = 40;

/**
 * One portfolio object over the card window: the photo whole on a dark stage,
 * arrows, thumbnails and a swipe on a phone. No wrap-around at either end.
 */
export function PortfolioObjectViewer({
  object,
  onOpenChange,
  returnFocusTo,
}: {
  object: PortfolioObject | null;
  onOpenChange: (open: boolean) => void;
  /** The tile that opened the window gets focus back when it closes. */
  returnFocusTo?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const swipeFrom = useRef<number | null>(null);
  const photos = object?.photos ?? [];
  const many = photos.length > 1;
  const last = photos.length - 1;

  useEffect(() => {
    setIndex(0);
  }, [object?.id]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(last, next)));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!many) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    swipeFrom.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    const to = event.changedTouches[0]?.clientX;
    if (from === null || to === undefined || !many) return;
    const delta = to - from;
    if (Math.abs(delta) < SWIPE_PX) return;
    go(delta < 0 ? index + 1 : index - 1);
  }

  return (
    <DialogPrimitive.Root open={object !== null} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-[rgba(14,13,6,0.6)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          data-testid="portfolio-viewer"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            if (!returnFocusTo) return;
            event.preventDefault();
            returnFocusTo.focus();
          }}
          className="fixed inset-0 z-[71] flex flex-col overflow-hidden bg-card text-foreground outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[860px] sm:max-w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-modal sm:shadow-xl"
        >
          {object ? (
            <>
              <div className="flex min-w-0 items-center gap-3 py-3.5 pl-[22px] pr-4">
                <DialogPrimitive.Title className="min-w-0 flex-1 text-[18px] font-bold tracking-tight [overflow-wrap:anywhere]">
                  {object.title}
                </DialogPrimitive.Title>
                {many ? (
                  <span className="whitespace-nowrap text-[13px] tabular-nums text-muted-foreground" data-testid="portfolio-position">
                    {t("contractorCard.portfolio.position", { current: index + 1, total: photos.length })}
                  </span>
                ) : null}
                <DialogPrimitive.Close
                  aria-label={t("common.close")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>
              <div
                className="relative grid min-h-0 w-full flex-1 touch-pan-y place-items-center overflow-hidden bg-[#16150F] sm:aspect-[3/2] sm:flex-none"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => {
                  swipeFrom.current = null;
                }}
              >
                <img
                  src={photos[index]}
                  alt={t("contractorCard.portfolio.photoAlt", { title: object.title, number: index + 1 })}
                  className="block h-full w-full select-none object-contain"
                  draggable={false}
                />
                {many ? (
                  <>
                    <button
                      type="button"
                      aria-label={t("contractorCard.portfolio.prev")}
                      disabled={index === 0}
                      onClick={() => go(index - 1)}
                      className="absolute left-3.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0E0D06] disabled:cursor-default disabled:opacity-35 sm:h-11 sm:w-11"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("contractorCard.portfolio.next")}
                      disabled={index === last}
                      onClick={() => go(index + 1)}
                      className="absolute right-3.5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#0E0D06] disabled:cursor-default disabled:opacity-35 sm:h-11 sm:w-11"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
              </div>
              {many ? (
                <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-6 pt-3 sm:pb-4">
                  {photos.map((photo, i) => (
                    <button
                      key={`${photo}-${i}`}
                      type="button"
                      aria-label={t("contractorCard.portfolio.thumb", { number: i + 1 })}
                      aria-current={i === index}
                      onClick={() => setIndex(i)}
                      className={cn(
                        "h-[54px] w-[72px] shrink-0 overflow-hidden rounded-[10px] border-2 border-transparent p-0",
                        i === index && "border-accent",
                      )}
                    >
                      <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
