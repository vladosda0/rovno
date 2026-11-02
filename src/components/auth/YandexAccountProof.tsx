import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isSameScreenReply } from "@/lib/email-code";
import { safeNextPath } from "@/lib/safe-next-path";
import type { YandexProof } from "@/lib/yandex-login";

interface YandexAccountProofProps {
  proof: YandexProof;
  next: string | null;
  onProven: (user: User) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * The person proves the account is theirs once (decision D4, mockup frames 4a, 5, 6).
 * The proof is an ordinary sign-in right here in the browser, so the password never
 * reaches our function and Auth's limits apply as for any sign-in.
 */
export function YandexAccountProof({ proof, next, onProven, onCancel }: YandexAccountProofProps) {
  const { t } = useTranslation();
  const { email, kind, name } = proof;
  const [useCode, setUseCode] = useState(kind !== "password");
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentOnce = useRef(false);
  const safeNext = safeNextPath(next);

  const sendCode = useCallback(async () => {
    const emailRedirectTo = `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options:
        kind === "new_email"
          ? { shouldCreateUser: true, emailRedirectTo, data: { full_name: name ?? "", passwordless: true } }
          : { shouldCreateUser: false, emailRedirectTo },
    });
    if (error && !isSameScreenReply(error)) {
      toast({
        title: t("auth.login.failureTitle"),
        description: error.message,
        variant: "destructive",
      });
    }
  }, [email, kind, name, safeNext, t]);

  useEffect(() => {
    if (!useCode || sentOnce.current) return;
    sentOnce.current = true;
    void sendCode();
  }, [sendCode, useCode]);

  if (useCode && kind === "new_email") {
    return (
      <EmailCodeStep
        email={email}
        onVerified={(session) => onProven(session.user)}
        onResend={sendCode}
        onCancel={onCancel}
      />
    );
  }

  if (useCode) {
    return (
      <EmailCodeStep
        email={email}
        title={t("auth.yandex.exists.title")}
        subtitle={t("auth.yandex.exists.codeSubtitle", { email })}
        submitLabel={t("auth.yandex.exists.submit")}
        onVerified={(session) => onProven(session.user)}
        onResend={sendCode}
        onCancel={onCancel}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setWrongPassword(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error?.code === "invalid_credentials") {
        setWrongPassword(true);
        return;
      }
      if (error) throw error;
      if (!data.session?.user) throw new Error(t("auth.login.noSession"));
      await onProven(data.session.user);
    } catch (error) {
      toast({
        title: t("auth.login.failureTitle"),
        description: error instanceof Error ? error.message : t("auth.login.genericFailure"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const linkClass = "text-body-sm text-accent hover:underline";

  return (
    <AuthCard title={t("auth.yandex.exists.title")} subtitle={t("auth.yandex.exists.passwordSubtitle", { email })}>
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="yandex-proof-password">{t("common.password")}</Label>
          <Input
            id="yandex-proof-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            aria-invalid={wrongPassword}
            aria-describedby={wrongPassword ? "yandex-proof-error" : undefined}
            className={wrongPassword ? "border-destructive" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setWrongPassword(false);
            }}
          />
          {wrongPassword && (
            <p id="yandex-proof-error" role="alert" className="text-caption text-destructive">
              {t("auth.yandex.exists.wrongPassword")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {t("auth.yandex.exists.submit")}
        </Button>
        <div className="flex flex-col items-center gap-1 text-center">
          <button type="button" className={linkClass} onClick={() => setUseCode(true)}>
            {t("auth.yandex.exists.useCode")}
          </button>
          <button type="button" className={linkClass} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </AuthCard>
  );
}
