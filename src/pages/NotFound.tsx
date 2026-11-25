import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentHead } from "@/lib/blog/seo";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  // Every unknown address answers 200 with the app shell (static host, SPA
  // fallback; an honest 404 is out of scope, epic site-redesign section 2), so
  // a crawler that runs JS must at least be told not to index it.
  // Its own canonical, so the landing canonical of the fallback shell never
  // stands next to noindex (review of PR #389).
  useDocumentHead({ title: `${t("error.notFound.message")} — Ровно`, robots: "noindex", canonicalPath: location.pathname });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{t("error.notFound.code")}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("error.notFound.message")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("error.notFound.returnHome")}
        </a>
      </div>
    </div>
  );
};

export default NotFound;
