import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_CODE_LENGTH, normalizeAppCode } from "@/lib/app-code";
import { cn } from "@/lib/utils";

interface AppCodeFieldProps {
  label: string;
  value: string;
  onChange: (code: string) => void;
  /** Called once the sixth digit is in, the way the email code step checks itself. */
  onComplete?: (code: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * The field for the code from the authenticator app (epic external-login, slice 4): the same
 * single numeric field as «Проверьте почту» (EmailCodeStep), so paste and the iOS code
 * suggestion work, and the sixth digit submits.
 */
export function AppCodeField({ label, value, onChange, onComplete, error, disabled, autoFocus }: AppCodeFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={APP_CODE_LENGTH + 1}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn("h-12 text-center font-mono text-2xl tracking-[0.35em] md:text-2xl", error && "border-destructive")}
        onChange={(e) => {
          const next = normalizeAppCode(e.target.value);
          onChange(next);
          if (next.length === APP_CODE_LENGTH) onComplete?.(next);
        }}
      />
      {error && (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
