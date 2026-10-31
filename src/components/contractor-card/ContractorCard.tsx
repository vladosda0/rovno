import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { PartyDetails } from "@/data/requisites-lookup-source";
import type { PartyCheck } from "@/hooks/use-party-status";
import { cn } from "@/lib/utils";
import { ContractorCardFace, type ContractorCardData } from "./ContractorCardFace";
import { ContractorCardWindow } from "./ContractorCardWindow";

const UNFOLD_MS = 720;
const FADE_MS = 150;
const UNFOLD_EASE = "cubic-bezier(.2,.75,.2,1)";
const PHONE_WIDTH = 640;
const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 720;
const WINDOW_MARGIN = 48;

type Phase = "closed" | "start" | "open" | "closing";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function finePointer(): boolean {
  return window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
}

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function windowBox(): Box {
  const { innerWidth: vw, innerHeight: vh } = window;
  const phone = vw < PHONE_WIDTH;
  const width = phone ? vw : Math.min(WINDOW_WIDTH, vw - WINDOW_MARGIN);
  const height = phone ? vh : Math.min(WINDOW_HEIGHT, vh - WINDOW_MARGIN);
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

export interface ContractorCardProps {
  card: ContractorCardData;
  check: PartyCheck | null;
  details: PartyDetails | null;
  /** Shown as «Редактировать визитку» in the window; absent for a member and in the form preview. */
  onEdit?: () => void;
  ariaLabel: string;
  className?: string;
}

/**
 * The card and its window: pressing the card turns it around its vertical axis
 * while it grows, and the reverse side is the window. Closing plays the same
 * back. With «reduce motion» the window only fades in.
 */
export function ContractorCard({ card, check, details, onEdit, ariaLabel, className }: ContractorCardProps) {
  const { t } = useTranslation();
  const sourceRef = useRef<HTMLButtonElement>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("closed");
  const phaseRef = useRef<Phase>("closed");
  phaseRef.current = phase;
  const [box, setBox] = useState<Box | null>(null);
  const [reduce, setReduce] = useState(false);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (phase !== "start") return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setBox(windowBox());
        setPhase("open");
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const onResize = () => setBox(windowBox());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  function openWindow() {
    const source = sourceRef.current;
    if (!source) return;
    source.style.transform = "";
    const reduced = reducedMotion();
    setReduce(reduced);
    setBox(reduced ? windowBox() : boxOf(source));
    setPhase("start");
  }

  const closeWindow = useCallback((then?: () => void) => {
    if (phaseRef.current === "closed" || phaseRef.current === "closing") return;
    afterClose.current = then ?? null;
    if (sourceRef.current && !reduce) setBox(boxOf(sourceRef.current));
    setPhase("closing");
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setPhase("closed");
      afterClose.current?.();
      afterClose.current = null;
    }, reduce ? FADE_MS : UNFOLD_MS);
  }, [reduce]);

  function tilt(event: PointerEvent<HTMLButtonElement>) {
    if (!finePointer() || reducedMotion()) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    target.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg)`;
  }

  const unfolded = phase === "open";
  const moverStyle: CSSProperties = {
    ...(box ?? {}),
    position: "fixed",
    perspective: 1800,
    transition: reduce ? undefined : ["left", "top", "width", "height"].map((prop) => `${prop} ${UNFOLD_MS}ms ${UNFOLD_EASE}`).join(","),
  };
  const spinStyle: CSSProperties = {
    transformStyle: "preserve-3d",
    transition: reduce ? undefined : `transform ${UNFOLD_MS}ms ${UNFOLD_EASE}`,
    transform: !reduce && unfolded ? "rotateY(180deg)" : "rotateY(0deg)",
  };
  const faceStyle: CSSProperties = reduce
    ? { opacity: unfolded ? 0 : 1, transition: `opacity ${FADE_MS}ms` }
    : { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  const backStyle: CSSProperties = reduce
    ? { opacity: unfolded ? 1 : 0, transition: `opacity ${FADE_MS}ms` }
    : { transform: "rotateY(180deg)", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

  return (
    <>
      <div className={cn("flex w-full justify-center [perspective:1400px]", className)}>
        <button
          ref={sourceRef}
          type="button"
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          onClick={openWindow}
          onPointerMove={tilt}
          onPointerLeave={(event) => {
            event.currentTarget.style.transform = "";
          }}
          className="w-[360px] max-w-full rounded-card text-left transition-transform duration-200 ease-out [transform-style:preserve-3d] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-4 motion-reduce:transition-none"
          style={{ visibility: phase === "closed" ? undefined : "hidden" }}
        >
          <ContractorCardFace card={card} check={check} />
        </button>
      </div>
      <DialogPrimitive.Root
        open={phase !== "closed"}
        onOpenChange={(open) => {
          if (!open) closeWindow();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[60] bg-[rgba(14,13,6,0.5)]"
            style={{ opacity: unfolded ? 1 : 0, transition: "opacity .4s" }}
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-testid="card-window"
            data-reduced-motion={reduce ? "true" : "false"}
            className="z-[61] outline-none"
            style={moverStyle}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[aria-label="${t("common.close")}"]`)?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              sourceRef.current?.focus();
            }}
          >
            <div className="absolute inset-0" data-testid="card-spin" style={spinStyle}>
              <div className="absolute inset-0" style={faceStyle} aria-hidden="true">
                <ContractorCardFace card={card} check={check} />
              </div>
              <div className="absolute inset-0" style={backStyle}>
                <ContractorCardWindow
                  card={card}
                  check={check}
                  details={details}
                  onEdit={onEdit ? () => closeWindow(onEdit) : undefined}
                />
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
