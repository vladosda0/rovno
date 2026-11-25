import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { supabase } from "@/integrations/supabase/client";
import { EMAIL_CODE_LENGTH, normalizeEmailCode } from "@/lib/email-code";
import { cn } from "@/lib/utils";

const RESEND_AFTER_SECONDS = 60;

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface EmailCodeStepProps {
  email: string;
  onVerified: (session: Session) => void | Promise<void>;
  onResend: () => Promise<void>;
  /** Shown as «Изменить почту»; left out where the address came from Yandex. */
  onChangeEmail?: () => void;
  /** Shown as «Отмена» on the Yandex proof steps. */
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
}

/**
 * The "check your email" step shared by sign-in and sign-up: one numeric field
 * for the six-digit code (paste and iOS code suggestion work on a single field,
 * not on six boxes), verification on the sixth digit, resend after a minute.
 * `type: "email"` verifies both the sign-in and the sign-up letter.
 */
export function EmailCodeStep({
  email,
  onVerified,
  onResend,
  onChangeEmail,
  onCancel,
  title,
  subtitle,
  submitLabel,
}: EmailCodeStepProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_AFTER_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);
  const latestCode = useRef("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const counting = secondsLeft > 0;

  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const verify = async (token: string) => {
    if (token.length !== EMAIL_CODE_LENGTH || inFlight.current) return;
    inFlight.current = true;
    setVerifying(true);
    setInvalid(false);
    setFailed(false);
    let signedIn = false;
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (data?.session && !error) {
        // supabase-js has already stored the session: finish the sign-in even
        // if the step was left meanwhile.
        signedIn = true;
        await onVerified(data.session);
      } else if (!mounted.current) {
        return;
      } else if (error?.status === 403 || error?.code === "otp_expired") {
        setInvalid(true);
      } else {
        setFailed(true);
      }
    } catch {
      if (!signedIn) setFailed(true);
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
    // The person corrected the code while this one was being checked.
    const next = latestCode.current;
    if (mounted.current && !signedIn && next !== token && next.length === EMAIL_CODE_LENGTH) void verify(next);
  };

  const handleChange = (raw: string) => {
    const next = normalizeEmailCode(raw);
    setCode(next);
    latestCode.current = next;
    if (invalid) setInvalid(false);
    if (failed) setFailed(false);
    if (next.length === EMAIL_CODE_LENGTH) void verify(next);
  };

  const handleResend = async () => {
    const sentAt = Date.now();
    setNow(sentAt);
    setResendAt(sentAt + RESEND_AFTER_SECONDS * 1000);
    setCode("");
    latestCode.current = "";
    setInvalid(false);
    setFailed(false);
    await onResend();
  };

  const linkClass = "text-body-sm text-accent hover:underline";

  return (
    <AuthCard title={title ?? t("auth.code.title")} subtitle={subtitle ?? t("auth.code.subtitle", { email })}>
      <form
        className="space-y-sp-2"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(code);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email-code">{t("auth.code.label")}</Label>
          <Input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            aria-invalid={invalid}
            aria-describedby={invalid || failed ? "email-code-error" : undefined}
            onChange={(e) => handleChange(e.target.value)}
            className={cn("h-12 text-center font-mono text-2xl tracking-[0.35em] md:text-2xl", invalid && "border-destructive")}
          />
          {(invalid || failed) && (
            <p id="email-code-error" role="alert" className="text-caption text-destructive">
              {invalid ? t("auth.code.invalid") : t("auth.code.failed")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={verifying} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {verifying ? t("auth.code.submitting") : (submitLabel ?? t("auth.code.submit"))}
        </Button>
        <div className="flex flex-col items-center gap-1 text-center">
          {secondsLeft > 0 ? (
            <p className="text-caption text-muted-foreground">
              {t("auth.code.resendIn", { time: formatCountdown(secondsLeft) })}
            </p>
          ) : (
            <button type="button" className={linkClass} onClick={() => void handleResend()}>
              {t("auth.code.resend")}
            </button>
          )}
          {onChangeEmail && (
            <button type="button" className={linkClass} onClick={onChangeEmail}>
              {t("auth.code.changeEmail")}
            </button>
          )}
          {onCancel && (
            <button type="button" className={linkClass} onClick={onCancel}>
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </AuthCard>
  );
}
