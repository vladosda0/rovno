import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { AppCodeField } from "@/components/auth/AppCodeField";
import { toast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import {
  callMfaRecovery,
  downloadRecoveryCodes,
  groupKey,
  listTotpFactors,
  LOW_CODES,
  type RecoveryStatus,
  type TotpFactor,
  verifyAppCode,
} from "@/lib/mfa";
import { cn } from "@/lib/utils";

/**
 * «Двухфакторная аутентификация» in Settings → Security (epic external-login, slice 4,
 * mockup frames 2, 3 and 6). Everything happens inside the row, like «Задать пароль» of
 * slice 1: two steps (QR code and the first code, then the recovery codes), then «Новые
 * коды» and «Выключить», each after a fresh code from the app.
 */

type Mode =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "scan"; factorId: string; qr: string; secret: string; uri: string }
  | { kind: "codes"; codes: string[]; fresh: boolean }
  | { kind: "on" }
  | { kind: "disable" }
  | { kind: "renew" };

type Verdict = "ok" | "invalid" | "too_many" | "failed";

const ROW = "rounded-panel bg-muted/40 p-1.5 px-sp-2";
const PANEL = "rounded-panel bg-muted/40 p-sp-2 space-y-sp-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:slide-in-from-bottom-0";
const BUTTONS = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
const PRIMARY = "w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90";

function formatDay(iso: string | null, locale: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date).replace(/\s?г\.$/, "");
}

function Row({ title, badge, notes, action }: { title: string; badge?: ReactNode; notes: ReactNode[]; action?: ReactNode }) {
  return (
    <div className={ROW} role="group" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body-sm font-medium text-foreground">{title}</p>
            {badge}
          </div>
          {notes}
        </div>
        {action}
      </div>
    </div>
  );
}

/** «Скопировать» that answers «Скопировано» for a moment, without motion. */
function CopyButton({ text, label, doneLabel, className }: { text: string; label: string; doneLabel: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(text).catch(() => undefined);
        } catch {
          // the browser refused; the text is selectable all the same
        }
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {done ? doneLabel : label}
    </Button>
  );
}

export function TwoFactorSection({ email }: { email: string | null }) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const autoStarted = useRef(false);

  const loadStatus = useCallback(async () => {
    const result = await callMfaRecovery<RecoveryStatus>("status");
    if (result.status === 200) setStatus(result.body);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const factors = await listTotpFactors();
      if (factors.some((f) => f.status === "verified")) {
        setMode({ kind: "on" });
        await loadStatus();
      } else {
        setMode({ kind: "off" });
        setStatus(null);
      }
    } catch {
      setMode({ kind: "off" });
    }
  }, [loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetInput = () => {
    setCode("");
    setError(null);
  };

  const verdictText = (verdict: Verdict, enrolling: boolean) =>
    verdict === "invalid"
      ? t(enrolling ? "security.twoFa.codeBadEnroll" : "security.twoFa.codeBad")
      : verdict === "too_many"
        ? t("security.twoFa.tooMany")
        : t("security.twoFa.failed");

  const startEnrol = useCallback(async () => {
    setBusy(true);
    resetInput();
    setShowQr(false);
    setDownloaded(false);
    try {
      // A half-finished attempt would block a new one with the same name.
      for (const f of await listTotpFactors()) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Rovno", friendlyName: "Rovno" });
      if (enrolError || !data) throw enrolError ?? new Error("enroll failed");
      setMode({ kind: "scan", factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
    } catch {
      toast({ title: t("security.twoFa.failed"), variant: "destructive" });
      setMode({ kind: "off" });
    } finally {
      setBusy(false);
    }
  }, [t]);

  // «Включить снова» after a recovery code lands here with ?mfa=enable.
  useEffect(() => {
    if (autoStarted.current || mode.kind !== "off" || searchParams.get("mfa") !== "enable") return;
    autoStarted.current = true;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("mfa");
      return next;
    }, { replace: true });
    void startEnrol();
  }, [mode.kind, searchParams, setSearchParams, startEnrol]);

  const cancelEnrol = async (factorId: string) => {
    setMode({ kind: "off" });
    resetInput();
    await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
  };

  const checkScan = async (factorId: string, value: string) => {
    if (busy) return;
    if (value.length < 6) {
      setError(t("security.twoFa.codeShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const verdict = await verifyAppCode(factorId, value);
      if (verdict !== "ok") {
        setError(verdictText(verdict, true));
        setCode("");
        return;
      }
      const result = await callMfaRecovery<{ codes?: string[] }>("generate");
      if (result.status === 200 && result.body.codes) {
        setDownloaded(false);
        setMode({ kind: "codes", codes: result.body.codes, fresh: false });
      } else {
        // The protection is on; the codes can be fetched again from the row.
        toast({ title: t("security.twoFa.failed"), variant: "destructive" });
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const verifiedFactorId = async (): Promise<string | null> =>
    (await listTotpFactors().catch((): TotpFactor[] => [])).find((f) => f.status === "verified")?.id ?? null;

  const withFreshCode = async (value: string, then: (factorId: string) => Promise<void>) => {
    if (busy) return;
    if (value.length < 6) {
      setError(t("security.twoFa.codeShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const factorId = await verifiedFactorId();
      if (!factorId) {
        await refresh();
        return;
      }
      const verdict = await verifyAppCode(factorId, value);
      if (verdict !== "ok") {
        setError(verdictText(verdict, false));
        setCode("");
        return;
      }
      await then(factorId);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = (value: string) =>
    withFreshCode(value, async (factorId) => {
      // Auth's own unenroll. No «выключена» letter yet: it comes with step 4.7, a trigger in the
      // database for verified factors only (Vlad 2026-11-12, «Сейчас без них»).
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) {
        setError(t("security.twoFa.failed"));
        return;
      }
      await supabase.auth.refreshSession().catch(() => undefined);
      resetInput();
      setStatus(null);
      setMode({ kind: "off" });
      toast({ title: t("security.twoFa.disabledToast"), description: t("security.twoFa.disabledToastText") });
    });

  const renew = (value: string) =>
    withFreshCode(value, async () => {
      const result = await callMfaRecovery<{ codes?: string[] }>("generate");
      if (result.status !== 200 || !result.body.codes) {
        setError(t("security.twoFa.failed"));
        return;
      }
      resetInput();
      setDownloaded(false);
      setMode({ kind: "codes", codes: result.body.codes, fresh: true });
    });

  const codesSaved = async (fresh: boolean) => {
    setBusy(true);
    try {
      await callMfaRecovery("confirm");
      setMode({ kind: "on" });
      await loadStatus();
      if (!fresh) toast({ title: t("security.twoFa.enabledToast"), description: t("security.twoFa.enabledToastText") });
    } finally {
      setBusy(false);
    }
  };

  const passkeyRow = (
    <Row
      title={t("security.passkey.label")}
      badge={<Badge variant="secondary" className="text-[10px]">{t("security.twoFa.comingSoon")}</Badge>}
      notes={[<p key="n" className="text-caption text-muted-foreground">{t("security.passkey.note")}</p>]}
    />
  );

  const codeButtons = (
    <div className={BUTTONS}>
      <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} onClick={() => {
        if (mode.kind === "scan") void cancelEnrol(mode.factorId);
        else {
          resetInput();
          setMode({ kind: "on" });
        }
      }}>
        {t("common.cancel")}
      </Button>
      {mode.kind === "disable" ? (
        <Button type="submit" size="sm" variant="destructive" className="w-full sm:w-auto" disabled={busy}>
          {t("security.twoFa.disable")}
        </Button>
      ) : (
        <Button type="submit" size="sm" className={PRIMARY} disabled={busy}>
          {mode.kind === "renew" ? t("security.twoFa.newCodesSubmit") : t("security.twoFa.verify")}
        </Button>
      )}
    </div>
  );

  const field = (onComplete: (value: string) => void) => (
    <AppCodeField
      label={t("security.twoFa.codeLabel")}
      value={code}
      onChange={(next) => {
        setCode(next);
        if (error) setError(null);
      }}
      onComplete={onComplete}
      error={error}
      disabled={busy}
      autoFocus
    />
  );

  let main: ReactNode = null;
  if (mode.kind === "loading") {
    main = <div className={cn(ROW, "h-12 animate-pulse")} aria-hidden />;
  } else if (mode.kind === "off") {
    main = (
      <Row
        title={t("security.twoFa.label")}
        notes={[<p key="n" className="text-caption text-muted-foreground">{t("security.twoFa.off")}</p>]}
        action={<Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void startEnrol()}>{t("security.twoFa.enable")}</Button>}
      />
    );
  } else if (mode.kind === "scan") {
    const { factorId, qr, secret, uri } = mode;
    const keyBox = (
      <div className="space-y-1.5">
        <p className="text-caption text-muted-foreground">{t("security.twoFa.keyLabel")}</p>
        <div className="flex items-center gap-2 rounded-md border border-input bg-background py-1.5 pl-3 pr-1.5">
          <code className="min-w-0 flex-1 select-all break-all font-mono text-body-sm tracking-wide">{groupKey(secret)}</code>
          <CopyButton text={secret} label={t("security.twoFa.copy")} doneLabel={t("security.twoFa.copied")} className="shrink-0" />
        </div>
      </div>
    );
    const qrImage = <img src={qr} alt={t("security.twoFa.qrAlt")} className="h-[152px] w-[152px] shrink-0 rounded-[12px] border border-border bg-white p-2.5" />;
    main = (
      <form className={PANEL} onSubmit={(e) => { e.preventDefault(); void checkScan(factorId, code); }}>
        <div className="space-y-1">
          <p className="text-caption text-muted-foreground">{t("security.twoFa.step", { n: 1 })}</p>
          <p className="text-body-sm font-semibold text-foreground">{t(isMobile ? "security.twoFa.scanTitleMobile" : "security.twoFa.scanTitle")}</p>
          <p className="text-body-sm text-muted-foreground">{t("security.twoFa.apps")}</p>
        </div>
        {isMobile ? (
          <div className="space-y-sp-2">
            <Button asChild variant="outline" className="w-full">
              <a href={uri}><ExternalLink className="h-4 w-4" aria-hidden />{t("security.twoFa.openInApp")}</a>
            </Button>
            {keyBox}
            {showQr && <div className="animate-in fade-in-0 duration-200">{qrImage}</div>}
            <button type="button" className="text-body-sm text-accent hover:underline" onClick={() => setShowQr((v) => !v)}>
              {t(showQr ? "security.twoFa.hideQr" : "security.twoFa.showQr")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-sp-2">
            {qrImage}
            <div className="min-w-0 flex-1 basis-[200px]">{keyBox}</div>
          </div>
        )}
        {field((value) => void checkScan(factorId, value))}
        {codeButtons}
      </form>
    );
  } else if (mode.kind === "codes") {
    const { codes, fresh } = mode;
    main = (
      <div className={PANEL}>
        <div className="space-y-1">
          {!fresh && <p className="text-caption text-muted-foreground">{t("security.twoFa.step", { n: 2 })}</p>}
          <p className="text-body-sm font-semibold text-foreground">{t(fresh ? "security.twoFa.codesTitleNew" : "security.twoFa.codesTitle")}</p>
          <p className="text-body-sm text-muted-foreground">{t(fresh ? "security.twoFa.codesLeadNew" : "security.twoFa.codesLead")}</p>
        </div>
        <ul className="grid select-all grid-cols-2 gap-x-4 gap-y-1.5 rounded-[12px] border border-input bg-background px-4 py-3.5 font-mono text-body-sm tracking-wide" aria-label={t("security.twoFa.codesRow")}>
          {codes.map((c) => <li key={c} className="whitespace-nowrap">{c}</li>)}
        </ul>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setDownloaded(downloadRecoveryCodes(codes, email))}>
            {downloaded ? <Check className="h-4 w-4" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {downloaded ? t("security.twoFa.downloaded") : t("security.twoFa.download")}
          </Button>
          <CopyButton text={codes.join("\n")} label={t("security.twoFa.copy")} doneLabel={t("security.twoFa.copied")} className="flex-1 border border-input bg-background" />
        </div>
        <div className={BUTTONS}>
          <Button type="button" size="sm" className={PRIMARY} disabled={busy} onClick={() => void codesSaved(fresh)}>
            {t("security.twoFa.codesSaved")}
          </Button>
        </div>
      </div>
    );
  } else {
    const left = status?.left ?? 0;
    const unsaved = status ? !status.confirmed : false;
    const onRow = (
      <Row
        title={t("security.twoFa.label")}
        notes={[<p key="n" className="text-caption text-muted-foreground">{t("security.twoFa.on", { date: formatDay(status?.since ?? null, i18n.language) })}</p>]}
        action={mode.kind === "on" ? <Button type="button" variant="outline" size="sm" onClick={() => { resetInput(); setMode({ kind: "disable" }); }}>{t("security.twoFa.disable")}</Button> : undefined}
      />
    );
    const codesRow = (
      <Row
        title={t("security.twoFa.codesRow")}
        notes={[
          unsaved ? (
            <p key="n" className="text-caption font-medium text-warning">{t("security.twoFa.codesUnsaved")}</p>
          ) : left <= LOW_CODES ? (
            <p key="n" className="text-caption font-medium text-warning">{t("security.twoFa.codesLow", { left })}</p>
          ) : (
            <p key="n" className="text-caption text-muted-foreground">{t("security.twoFa.codesLeft", { left })}</p>
          ),
        ]}
        action={mode.kind === "on" ? <Button type="button" variant="outline" size="sm" onClick={() => { resetInput(); setMode({ kind: "renew" }); }}>{t("security.twoFa.newCodes")}</Button> : undefined}
      />
    );
    if (mode.kind === "disable") {
      main = (
        <>
          <form className={PANEL} onSubmit={(e) => { e.preventDefault(); void turnOff(code); }}>
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">{t("security.twoFa.disableTitle")}</p>
              <p className="text-body-sm text-muted-foreground">{t("security.twoFa.disableLead")}</p>
            </div>
            {field((value) => void turnOff(value))}
            {codeButtons}
          </form>
          {codesRow}
        </>
      );
    } else if (mode.kind === "renew") {
      main = (
        <>
          {onRow}
          <form className={PANEL} onSubmit={(e) => { e.preventDefault(); void renew(code); }}>
            <div className="space-y-1">
              <p className="text-body-sm font-semibold text-foreground">{t("security.twoFa.newCodesTitle")}</p>
              <p className="text-body-sm text-muted-foreground">{t("security.twoFa.newCodesLead")}</p>
            </div>
            {field((value) => void renew(value))}
            {codeButtons}
          </form>
        </>
      );
    } else {
      main = (
        <>
          {onRow}
          {status && codesRow}
        </>
      );
    }
  }

  return (
    <SettingsSection title={t("security.twoFa.title")} description={t("security.twoFa.description")}>
      <div className="space-y-sp-2">
        {main}
        {passkeyRow}
      </div>
    </SettingsSection>
  );
}
