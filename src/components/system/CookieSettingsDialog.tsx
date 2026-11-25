// CookieSettingsDialog — «Настройки cookie» (rovno#333).
//
// Opened by OPEN_COOKIE_SETTINGS_EVENT (the landing footer link and the link in
// section 9 of the privacy policy), so one instance mounted in App serves every
// page. A centred dialog from 768 px, a bottom sheet below it, as elsewhere in
// Rovno. Analytics starts switched on because Metrika runs until the visitor
// says no (Vlad's decision 11.11, variant B). Switching it off and saving
// reloads the page: a loaded tag.js cannot be unloaded.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { OPEN_COOKIE_SETTINGS_EVENT, analyticsDeclined, writeCookieConsent } from "@/lib/cookie-consent";

/** Indirection over the full page reload, which jsdom cannot perform. */
export const cookieSettingsReload = {
  reload(): void {
    window.location.reload();
  },
};

function CategoryRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-card border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="m-0 text-[15px] font-semibold leading-[22px]">{title}</p>
        <p className="m-0 mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-none items-center pt-0.5">{control}</div>
    </div>
  );
}

export function CookieSettingsDialog() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [initialAnalytics, setInitialAnalytics] = useState(true);
  const [analytics, setAnalytics] = useState(true);

  useEffect(() => {
    const onOpen = () => {
      // analyticsDeclined() also knows a "no" the browser refused to store.
      const current = !analyticsDeclined();
      setInitialAnalytics(current);
      setAnalytics(current);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpen);
  }, []);

  const save = () => {
    const saved = writeCookieConsent(analytics);
    setOpen(false);
    // Turning Metrika off needs a fresh document; turning it back on is the
    // same, so the counter starts with this page rather than the next one.
    // A choice the browser refused to keep would be gone after the reload.
    if (saved && analytics !== initialAnalytics) cookieSettingsReload.reload();
  };

  const body = (
    <div className="flex flex-col gap-3">
      <CategoryRow
        title={t("cookieConsent.settings.necessaryTitle")}
        description={t("cookieConsent.settings.necessaryDescription")}
        control={
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("cookieConsent.settings.alwaysOn")}</span>
            <Switch checked disabled aria-label={`${t("cookieConsent.settings.necessaryTitle")}: ${t("cookieConsent.settings.alwaysOn")}`} />
          </span>
        }
      />
      <CategoryRow
        title={t("cookieConsent.settings.analyticsTitle")}
        description={t("cookieConsent.settings.analyticsDescription")}
        control={
          <Switch
            checked={analytics}
            onCheckedChange={setAnalytics}
            aria-label={t("cookieConsent.settings.analyticsTitle")}
          />
        }
      />
    </div>
  );

  const footer = (
    <div className={cn("flex items-center gap-4", isMobile ? "flex-col-reverse items-stretch" : "justify-between")}>
      <Link
        to="/privacy#cookies"
        onClick={() => setOpen(false)}
        className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("cookieConsent.settings.privacyLink")}
      </Link>
      <button
        type="button"
        onClick={save}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-pill bg-primary px-7 text-[15px] font-semibold text-primary-foreground",
          "transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isMobile ? "w-full" : "md:h-10",
        )}
      >
        {t("cookieConsent.settings.save")}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="rounded-t-panel px-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col gap-1.5">
              <DrawerTitle>{t("cookieConsent.settings.title")}</DrawerTitle>
              <DrawerDescription>{t("cookieConsent.settings.description")}</DrawerDescription>
            </div>
            {body}
            {footer}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-5 sm:max-w-[480px] sm:rounded-modal">
        <div className="flex flex-col gap-1.5 pr-6">
          <DialogTitle>{t("cookieConsent.settings.title")}</DialogTitle>
          <DialogDescription>{t("cookieConsent.settings.description")}</DialogDescription>
        </div>
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
