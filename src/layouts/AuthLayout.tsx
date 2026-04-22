import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-sp-2">
      <div className="w-full max-w-md">
        <div className="mb-sp-4 flex justify-center">
          <Link to="/" aria-label={t("nav.appName")}>
            <img src="/logo.svg" alt={t("nav.appName")} className="h-12 w-auto" />
          </Link>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
