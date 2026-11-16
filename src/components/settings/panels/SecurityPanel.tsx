import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ConnectedAccountsSection } from "@/components/settings/panels/ConnectedAccountsSection";
import { TwoFactorSection } from "@/components/settings/panels/TwoFactorSection";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { supabase } from "@/integrations/supabase/client";
import { Monitor } from "lucide-react";

function parseCurrentDevice(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  let browser = "Browser";
  // iOS third-party browsers run on WebKit and advertise their own tokens
  // (CriOS/FxiOS/EdgiOS), not Chrome//Firefox//Edg/ — detect those first.
  if (/EdgiOS\//.test(ua)) browser = "Edge";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} on ${os}` : browser;
}

/**
 * «Пароль»: set or change it in the row itself, no dialog (epic external-login,
 * slice 1). An account registered by code carries `passwordless: true` in its
 * metadata until a password is saved; no marker means a password exists (every
 * account made before code sign-up has one). The marker is cosmetic: GoTrue
 * still decides who signs in with what.
 */
function PasswordSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const [hasPassword, setHasPassword] = useState(user.user_metadata?.passwordless !== true);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword("");
    setPasswordConfirm("");
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t("auth.signup.validationPasswordLength"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("auth.signup.validationPasswordMismatch"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password, data: { passwordless: false } });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setHasPassword(true);
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection title={t("security.password.title")} description={t("security.password.description")}>
      {open ? (
        <form onSubmit={handleSave} className="rounded-panel bg-muted/40 p-sp-2 space-y-sp-2">
          <div className="space-y-1.5">
            <Label htmlFor="security-new-password">{t("security.password.newLabel")}</Label>
            <Input
              id="security-new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="security-new-password-confirm">{t("auth.signup.confirmPasswordLabel")}</Label>
            <Input
              id="security-new-password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              aria-invalid={error !== null}
              aria-describedby={error ? "security-password-error" : undefined}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
            {error && (
              <p id="security-password-error" role="alert" className="text-caption text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={saving} onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
              {t("common.save")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-body-sm font-medium text-foreground">
                {hasPassword ? t("security.password.set") : t("security.password.notSet")}
              </p>
              <p className="text-caption text-muted-foreground">
                {hasPassword ? t("security.password.setNote") : t("security.password.notSetNote")}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              {hasPassword ? t("security.password.changeAction") : t("security.password.setAction")}
            </Button>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

export function SecurityPanel() {
  const { t } = useTranslation();
  const { status, user } = useRuntimeAuth();
  const currentDevice = useMemo(() => parseCurrentDevice(), []);
  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("security.sessions.title")} description={t("security.sessions.description")}>
        <div className="space-y-sp-2">
          {status === "authenticated" && (
            <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="flex items-start gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body-sm font-medium text-foreground">{currentDevice}</p>
                    <Badge variant="secondary" className="text-[10px]">{t("security.sessions.current")}</Badge>
                  </div>
                  <p className="text-caption text-muted-foreground">{t("security.sessions.currentActive")}</p>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-medium text-foreground">{t("security.sessions.multiDevice")}</p>
                <Badge variant="secondary" className="text-[10px]">{t("security.sessions.comingSoon")}</Badge>
              </div>
              <p className="text-caption text-muted-foreground">{t("security.sessions.multiDeviceNote")}</p>
            </div>
          </div>
        </div>
      </SettingsSection>

      {status === "authenticated" && user && <PasswordSection key={user.id} user={user} />}

      {status === "authenticated" && user ? (
        <TwoFactorSection key={`two-factor-${user.id}`} email={user.email ?? null} />
      ) : (
      <SettingsSection title={t("security.twoFa.title")} description={t("security.twoFa.description")}>
        <div className="rounded-panel bg-muted/40 p-1.5 px-sp-2">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body-sm font-medium text-foreground">{t("security.twoFa.label")}</p>
              <Badge variant="secondary" className="text-[10px]">{t("security.twoFa.comingSoon")}</Badge>
            </div>
            <p className="text-caption text-muted-foreground">{t("security.twoFa.notConfigured")}</p>
          </div>
        </div>
      </SettingsSection>
      )}

      {status === "authenticated" ? (
        <ConnectedAccountsSection />
      ) : (
        <SettingsSection title={t("security.connected.title")} description={t("security.connected.description")}>
          <Card className="bg-muted/30">
            <CardContent className="p-sp-2">
              <p className="text-caption text-muted-foreground">{t("security.connected.empty")}</p>
            </CardContent>
          </Card>
        </SettingsSection>
      )}
    </div>
  );
}
