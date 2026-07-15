import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExitDemo } from "@/hooks/use-exit-demo";
import { trackEvent } from "@/lib/analytics";

/**
 * Fixed strip above the TopBar while a demo session is active. The demo is a
 * sandboxed mockup, not an account, so all demo affordances live here — the
 * honest label, the explicit exit and the signup CTA — leaving the 48px app
 * bar exactly as roomy as it is for real users (the in-bar variant crowded
 * the project tabs off-screen).
 *
 * Exposes its height as `--demo-banner-h` on <html> (same mechanism the old
 * EnvBanner used): the fixed TopBar and the sticky panels offset themselves
 * via the var, which collapses to 0px the moment the banner unmounts.
 */
const BANNER_HEIGHT_PX = 40;

export function DemoModeBanner() {
  const { t } = useTranslation();
  const exitDemo = useExitDemo();

  useEffect(() => {
    document.documentElement.style.setProperty("--demo-banner-h", `${BANNER_HEIGHT_PX}px`);
    return () => {
      document.documentElement.style.removeProperty("--demo-banner-h");
    };
  }, []);

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex h-10 items-center gap-2 border-b border-amber-400/50 bg-amber-100/95 px-3 text-amber-950 backdrop-blur supports-[backdrop-filter]:bg-amber-100/85"
    >
      <p className="min-w-0 truncate text-body-sm">
        <span className="font-semibold">{t("demo.banner")}</span>
        <span className="hidden text-amber-950/70 sm:inline"> · {t("demo.bannerNote")}</span>
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-amber-950 hover:bg-amber-200/70 hover:text-amber-950"
          onClick={exitDemo}
          aria-label={t("demo.exit")}
          title={t("demo.exit")}
        >
          <LogOut className="h-3.5 w-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">{t("demo.exit")}</span>
        </Button>
        <Button size="sm" className="h-7" asChild>
          <Link to="/auth/signup" onClick={() => trackEvent("demo_signup_cta_clicked")}>
            <span className="sm:hidden">{t("demo.createOwnShort")}</span>
            <span className="hidden sm:inline">{t("demo.createOwn")}</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
