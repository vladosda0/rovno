import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { AppCodeField } from "@/components/auth/AppCodeField";
import { toast } from "@/hooks/use-toast";
import { APP_CODE_LENGTH } from "@/lib/app-code";
import { isAppCodeOwedForChange, listTotpFactors, verifyAppCode } from "@/lib/mfa";
import {
  forgetMissingPasskeys,
  listPasskeys,
  passkeysSetUpHere,
  passkeySupported,
  renamePasskey,
  setUpPasskeyHere,
  turnOffPasskey,
  type PasskeyItem,
} from "@/lib/passkey";
import { labelPasskeys } from "@/lib/passkey-names";
import { cn } from "@/lib/utils";

/**
 * «Вход по лицу или отпечатку» in Settings → Security (epic external-login, slice 5, step 5.6,
 * mockup frames 5-7). Its own section above «Пароль»: a way to sign in, not a second step.
 * Everything happens inside the row, like «Задать пароль» and the two-factor steps: rename,
 * the turn-off confirmation and, for a person who signed in by face with the protection on,
 * the code from the app that Auth wants before adding or removing a device.
 */

const ROW = "rounded-panel bg-muted/40 p-1.5 px-sp-2";
const PANEL = "rounded-panel bg-muted/40 p-sp-2 space-y-sp-2";
const BUTTONS = "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
const PRIMARY = "w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90";
const MAX_NAME = 60;

type Action = { kind: "setup" } | { kind: "off"; id: string };
type Panel = { kind: "rename"; id: string } | { kind: "off"; id: string } | { kind: "code"; action: Action } | null;

function dayFormatter(locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });
}

function formatDay(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return dayFormatter(locale).format(date).replace(/\s?г\.$/, "");
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function hostForPasswords(): string {
  return typeof window !== "undefined" ? window.location.hostname.replace(/^www\./, "") : "rovno.ai";
}

export function PasskeySection({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const supported = passkeySupported();
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [codeOwed, setCodeOwed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const list = await listPasskeys();
      forgetMissingPasskeys(userId, list.map((p) => p.id));
      setPasskeys(list);
    } catch {
      setPasskeys((current) => current ?? []);
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    void isAppCodeOwedForChange().then(setCodeOwed);
  }, [load]);

  const labels = useMemo(() => labelPasskeys(passkeys ?? []), [passkeys]);
  const here = useMemo(() => new Set(passkeys ? passkeysSetUpHere(userId) : []), [passkeys, userId]);

  const lastUsed = (iso: string | undefined) => {
    if (!iso) return t("security.passkey.neverUsed");
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t("security.passkey.neverUsed");
    const time = new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(date);
    const now = new Date();
    if (sameDay(date, now)) return t("security.passkey.today", { time });
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return t("security.passkey.yesterday", { time });
    return `${formatDay(iso, i18n.language)}, ${time}`;
  };

  const askCode = (action: Action) => {
    setCode("");
    setCodeError(null);
    setPanel({ kind: "code", action });
  };

  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // quietCancel: right after the code from the app, a browser that lost the click (WebKit
  // keeps the user activation only briefly) refuses the window; the button is simply back, and
  // the next press works, now that the step is passed.
  const doSetUp = async ({ quietCancel = false }: { quietCancel?: boolean } = {}) => {
    setError(null);
    setSettingUp(true);
    const outcome = await setUpPasskeyHere(userId).finally(() => setSettingUp(false));
    if (outcome.kind === "ok") {
      setPanel(null);
      setFresh(outcome.passkey.id);
      setPasskeys((current) => [...(current ?? []).filter((p) => p.id !== outcome.passkey.id), outcome.passkey]);
      toast({ title: t("security.passkey.setUpDone"), description: t("security.passkey.setUpDoneText") });
      void load();
      return;
    }
    if (outcome.error === "needs_code") {
      setCodeOwed(true);
      askCode({ kind: "setup" });
      return;
    }
    if (quietCancel && outcome.error === "cancel") return;
    setError(
      t(outcome.error === "cancel" ? "security.passkey.cancelled" : outcome.error === "exists" ? "security.passkey.exists" : "security.twoFa.failed"),
    );
  };

  const doTurnOff = async (id: string) => {
    setError(null);
    const result = await turnOffPasskey(id);
    if (result === "needs_code") {
      setCodeOwed(true);
      askCode({ kind: "off", id });
      return;
    }
    if (result === "failed") {
      setError(t("security.twoFa.failed"));
      return;
    }
    setPanel(null);
    setLeaving(id);
    toast({ title: t("security.passkey.turnedOff"), description: t("security.passkey.turnedOffText") });
    setTimeout(() => {
      setPasskeys((current) => (current ?? []).filter((p) => p.id !== id));
      setLeaving((current) => (current === id ? null : current));
    }, 150);
  };

  const startSetUp = () => {
    setPanel(null);
    setError(null);
    if (codeOwed) {
      askCode({ kind: "setup" });
      return;
    }
    void run(doSetUp);
  };

  const confirmTurnOff = (id: string) => {
    if (codeOwed) {
      askCode({ kind: "off", id });
      return;
    }
    void run(() => doTurnOff(id));
  };

  const submitCode = (value: string, action: Action) =>
    run(async () => {
      if (value.length < APP_CODE_LENGTH) {
        setCodeError(t("security.twoFa.codeShort"));
        return;
      }
      setCodeError(null);
      const factorId = (await listTotpFactors().catch(() => [])).find((f) => f.status === "verified")?.id ?? null;
      const verdict = factorId ? await verifyAppCode(factorId, value) : "failed";
      if (verdict !== "ok") {
        setCode("");
        setCodeError(t(verdict === "invalid" ? "security.twoFa.codeBad" : verdict === "too_many" ? "security.twoFa.tooMany" : "security.twoFa.failed"));
        return;
      }
      setCodeOwed(false);
      setPanel(null);
      if (action.kind === "setup") await doSetUp({ quietCancel: true });
      else await doTurnOff(action.id);
    });

  const saveName = (id: string) =>
    run(async () => {
      const value = name.trim().slice(0, MAX_NAME);
      if (!value) return;
      if (!(await renamePasskey(id, value))) {
        setError(t("security.twoFa.failed"));
        return;
      }
      setPasskeys((current) => (current ?? []).map((p) => (p.id === id ? { ...p, friendly_name: value } : p)));
      setPanel(null);
      toast({ title: t("security.passkey.renamed") });
    });

  const setUpButton = (full = false) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(full && "w-full sm:w-auto")}
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={startSetUp}
    >
      {settingUp ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
      {settingUp ? t("auth.passkey.waiting") : t("security.passkey.setUp")}
    </Button>
  );

  const errorLine = error ? (
    <p role="alert" className="text-caption text-destructive">
      {error}
    </p>
  ) : null;

  const codePanel = (action: Action) => (
    <form
      className={PANEL}
      onSubmit={(e) => {
        e.preventDefault();
        void submitCode(code, action);
      }}
    >
      <div className="space-y-1">
        <p className="text-body-sm font-semibold text-foreground">{t("security.passkey.codeTitle")}</p>
        <p className="text-body-sm text-muted-foreground">
          {t(action.kind === "setup" ? "security.passkey.codeLeadSetUp" : "security.passkey.codeLeadTurnOff")}
        </p>
      </div>
      <AppCodeField
        label={t("security.twoFa.codeLabel")}
        value={code}
        onChange={(next) => {
          setCode(next);
          if (codeError) setCodeError(null);
        }}
        onComplete={(value) => void submitCode(value, action)}
        error={codeError}
        disabled={busy}
        autoFocus
      />
      <div className={BUTTONS}>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} onClick={() => setPanel(null)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" className={PRIMARY} disabled={busy}>
          {t("security.passkey.continue")}
        </Button>
      </div>
    </form>
  );

  const renamePanel = (passkey: PasskeyItem) => (
    <form
      className={PANEL}
      onSubmit={(e) => {
        e.preventDefault();
        void saveName(passkey.id);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`passkey-name-${passkey.id}`}>{t("security.passkey.renameLabel")}</Label>
        <Input
          id={`passkey-name-${passkey.id}`}
          type="text"
          maxLength={MAX_NAME}
          autoFocus
          value={name}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={BUTTONS}>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} onClick={() => setPanel(null)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" className={PRIMARY} disabled={busy || !name.trim()}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );

  const offPanel = (passkey: PasskeyItem, last: boolean) => (
    <div className={PANEL}>
      <div className="space-y-1">
        <p className="text-body-sm font-semibold text-foreground">{t("security.passkey.turnOffTitle", { name: labels[passkey.id] })}</p>
        <p className="text-body-sm text-muted-foreground">
          {last ? `${t("security.passkey.turnOffLast")} ` : ""}
          {t("security.passkey.turnOffLead", { host: hostForPasswords() })}
        </p>
      </div>
      <div className={BUTTONS}>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" disabled={busy} onClick={() => setPanel(null)}>
          {t("common.cancel")}
        </Button>
        <Button type="button" size="sm" variant="destructive" className="w-full sm:w-auto" disabled={busy} onClick={() => confirmTurnOff(passkey.id)}>
          {t("security.passkey.turnOff")}
        </Button>
      </div>
    </div>
  );

  const passkeyRow = (passkey: PasskeyItem) => {
    const label = labels[passkey.id];
    return (
      <div
        key={passkey.id}
        className={cn(
          ROW,
          "transition-opacity duration-150 motion-reduce:transition-none",
          fresh === passkey.id && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:slide-in-from-bottom-0",
          leaving === passkey.id && "opacity-0",
        )}
        role="group"
        aria-label={label}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-content-center rounded-[6px] border border-border bg-background text-foreground" aria-hidden>
              <KeyRound className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-body-sm font-medium text-foreground break-words">{label}</p>
                {here.has(passkey.id) && <Badge variant="secondary" className="text-[10px]">{t("security.passkey.thisBrowser")}</Badge>}
              </div>
              <p className="text-caption text-muted-foreground">{t("security.passkey.created", { date: formatDay(passkey.created_at, i18n.language) })}</p>
              <p className="text-caption text-muted-foreground">{t("security.passkey.lastUsed", { when: lastUsed(passkey.last_used_at) })}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                setName(label);
                setPanel({ kind: "rename", id: passkey.id });
              }}
            >
              {t("security.passkey.rename")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                setPanel({ kind: "off", id: passkey.id });
              }}
            >
              {t("security.passkey.turnOff")}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const unsupportedRow = (
    <div className={ROW}>
      <div className="space-y-0.5">
        <p className="text-body-sm font-medium text-foreground">{t("security.passkey.unsupported")}</p>
        <p className="text-caption text-muted-foreground">{t("security.passkey.unsupportedNote")}</p>
      </div>
    </div>
  );

  let body: ReactNode;
  if (passkeys === null) {
    body = <div className={cn(ROW, "h-12 animate-pulse")} aria-hidden />;
  } else if (passkeys.length === 0) {
    body = supported ? (
      <>
        <div className={ROW}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-body-sm font-medium text-foreground">{t("security.passkey.empty")}</p>
              <p className="text-caption text-muted-foreground">{t("security.passkey.emptyNote")}</p>
              {panel === null && errorLine}
            </div>
            {panel?.kind !== "code" && setUpButton()}
          </div>
        </div>
        {panel?.kind === "code" && codePanel(panel.action)}
      </>
    ) : (
      unsupportedRow
    );
  } else {
    body = (
      <>
        {passkeys.map((passkey) => (
          <div key={passkey.id} className="space-y-sp-2">
            {passkeyRow(passkey)}
            {panel?.kind === "rename" && panel.id === passkey.id && renamePanel(passkey)}
            {panel?.kind === "off" && panel.id === passkey.id && offPanel(passkey, passkeys.length === 1)}
            {panel?.kind === "code" && panel.action.kind === "off" && panel.action.id === passkey.id && codePanel(panel.action)}
          </div>
        ))}
        {errorLine}
        {panel?.kind === "code" && panel.action.kind === "setup" && codePanel(panel.action)}
        {supported ? panel?.kind !== "code" && <div className="flex justify-end">{setUpButton(true)}</div> : unsupportedRow}
      </>
    );
  }

  return (
    <SettingsSection title={t("security.passkey.title")} description={t("security.passkey.description")}>
      <div className="space-y-sp-2">
        {body}
        {loadFailed && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="alert" className="text-caption text-destructive">{t("security.twoFa.failed")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              {t("common.retry")}
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
