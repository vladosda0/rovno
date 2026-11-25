/**
 * Shurik's panel as a separate rounded card, the same in a project and outside one
 * (docs-library 6.5, frames 1 and 1a). On a phone the panel is the whole screen, so the
 * card look starts at `md`.
 */
export const SHURIK_PANEL_CARD_CLASS = [
  "glass-sidebar sticky z-10",
  "top-[calc(48px+var(--demo-banner-h,0px))] h-[calc(100svh-48px-var(--demo-banner-h,0px))]",
  "md:top-[calc(56px+var(--demo-banner-h,0px))] md:h-[calc(100svh-64px-var(--demo-banner-h,0px))]",
  "md:m-2 md:rounded-panel md:border md:border-border md:!bg-card md:!shadow-[0_6px_20px_hsl(var(--foreground)/0.08)]",
].join(" ");
