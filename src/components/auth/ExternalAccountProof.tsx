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
import type { ExternalProof, LoginProvider } from "@/lib/external-login";

interface ExternalAccountProofProps {
  provider: LoginProvider;
  proof: ExternalProof;
  next: string | null;
  onProven: (user: User) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * The person proves the account is theirs once (decision D4; mockups external-login-s2,
 * frames 4a-6, and external-login-s3, frames 5-6). The proof is an ordinary sign-in right
 * here in the browser, so the password never reaches our function and Auth's limits apply
 * as for any sign-in. When VK passed no email the person names one first («Укажите
 * почту») and proves it with a code; a new address gets an account, an existing one leads
 * into that account.
 */
export function ExternalAccountProof({ provider, proof, next, onProven, onCancel }: ExternalAccountProofProps) {
  const { t } = useTranslation();
  const { kind, name } = proof;
  const asksForEmail = kind === "need_email";
  const [typedEmail, setTypedEmail] = useState("");
  const [chosenEmail, setChosenEmail] = useState<string | null>(null);
  const email = asksForEmail ? chosenEmail : proof.email;
  const createsAccount = kind === "new_email" || asksForEmail;
  const [useCode, setUseCode] = useState(kind !== "password");
  const [password, setPassword] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentFor = useRef<string | null>(null);
  const safeNext = safeNextPath(next);

  const sendCode = useCallback(async () => {
    if (!email) return;
    const emailRedirectTo = `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: createsAccount
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
  }, [createsAccount, email, name, safeNext, t]);

  // The provider's address gets its code at once; a typed one when the person asks.
  useEffect(() => {
    if (asksForEmail || !useCode || !email || sentFor.current === email) return;
    sentFor.current = email;
    void sendCode();
  }, [asksForEmail, email, sendCode, useCode]);

  const subtitleKey = (which: "passwordSubtitle" | "codeSubtitle") => `auth.${provider}.exists.${which}`;

  if (asksForEmail && !chosenEmail) {
    const handleAsk = async (e: React.FormEvent) => {
      e.preventDefault();
      const value = typedEmail.trim().toLowerCase();
      if (!value) return;
      setLoading(true);
      setChosenEmail(value);
    };
    return (
      <AuthCard title={t("auth.vk.askEmail.title")} subtitle={t("auth.vk.askEmail.subtitle")}>
        <form onSubmit={handleAsk} className="space-y-sp-2">
          <div className="space-y-1.5">
            <Label htmlFor="external-proof-email">{t("common.email")}</Label>
            <Input
              id="external-proof-email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder={t("common.emailPlaceholder")}
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {loading ? t("auth.code.sending") : t("auth.code.send")}
          </Button>
          <div className="text-center">
            <button type="button" className="text-body-sm text-accent hover:underline" onClick={onCancel}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  if (asksForEmail && chosenEmail) {
    return (
      <AskedEmailCode
        email={chosenEmail}
        send={sendCode}
        onVerified={onProven}
        onChangeEmail={() => {
          setLoading(false);
          setChosenEmail(null);
        }}
        onCancel={onCancel}
      />
    );
  }

  // Here the provider gave the address.
  const providerEmail = email ?? "";

  if (useCode && kind === "new_email") {
    return (
      <EmailCodeStep
        email={providerEmail}
        onVerified={(session) => onProven(session.user)}
        onResend={sendCode}
        onCancel={onCancel}
      />
    );
  }

  if (useCode) {
    return (
      <EmailCodeStep
        email={providerEmail}
        title={t("auth.external.exists.title")}
        subtitle={t(subtitleKey("codeSubtitle"), { email: providerEmail })}
        submitLabel={t("auth.external.exists.submit")}
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
      const { data, error } = await supabase.auth.signInWithPassword({ email: providerEmail, password });
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
    <AuthCard title={t("auth.external.exists.title")} subtitle={t(subtitleKey("passwordSubtitle"), { email: providerEmail })}>
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="external-proof-password">{t("common.password")}</Label>
          <Input
            id="external-proof-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            aria-invalid={wrongPassword}
            aria-describedby={wrongPassword ? "external-proof-error" : undefined}
            className={wrongPassword ? "border-destructive" : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setWrongPassword(false);
            }}
          />
          {wrongPassword && (
            <p id="external-proof-error" role="alert" className="text-caption text-destructive">
              {t("auth.external.exists.wrongPassword")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {t("auth.external.exists.submit")}
        </Button>
        <div className="flex flex-col items-center gap-1 text-center">
          <button type="button" className={linkClass} onClick={() => setUseCode(true)}>
            {t("auth.external.exists.useCode")}
          </button>
          <button type="button" className={linkClass} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </AuthCard>
  );
}

/** «Проверьте почту» for the address typed on «Укажите почту»: the code goes out once per address. */
function AskedEmailCode({
  email,
  send,
  onVerified,
  onChangeEmail,
  onCancel,
}: {
  email: string;
  send: () => Promise<void>;
  onVerified: (user: User) => void | Promise<void>;
  onChangeEmail: () => void;
  onCancel: () => void;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void send();
  }, [send]);
  return (
    <EmailCodeStep
      email={email}
      onVerified={(session) => onVerified(session.user)}
      onResend={send}
      onChangeEmail={onChangeEmail}
      onCancel={onCancel}
    />
  );
}
