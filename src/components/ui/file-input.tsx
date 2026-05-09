import * as React from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  /** Localized fallback shown when no file is selected. Defaults to t("fileInput.empty"). */
  emptyLabel?: string;
  /** Localized label for the trigger button. Defaults to t("fileInput.choose"). */
  chooseLabel?: string;
}

/**
 * Localized replacement for the native file input. The browser-rendered
 * "Choose File / No file chosen" labels are baked into the user's browser
 * locale, so we hide the native input and render a styled trigger plus a
 * filename label that reads from i18n.
 */
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  function FileInput(
    { className, onChange, disabled, emptyLabel, chooseLabel, ...props },
    forwardedRef,
  ) {
    const { t } = useTranslation();
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const [filename, setFilename] = React.useState<string>("");

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    };

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) {
        setFilename("");
      } else if (files.length === 1) {
        setFilename(files[0].name);
      } else {
        setFilename(t("fileInput.selectedCount", { count: files.length }));
      }
      onChange?.(e);
    }

    function openPicker() {
      if (disabled) return;
      innerRef.current?.click();
    }

    return (
      <div
        className={cn(
          "flex h-10 items-center gap-2 rounded-input border border-border bg-background px-3 text-body-sm",
          disabled && "opacity-60 cursor-not-allowed",
          className,
        )}
      >
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-caption font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {chooseLabel ?? t("fileInput.choose")}
        </button>
        <span className={cn("flex-1 truncate", filename ? "text-foreground" : "text-muted-foreground")}>
          {filename || emptyLabel || t("fileInput.empty")}
        </span>
        <input
          {...props}
          ref={setRefs}
          type="file"
          disabled={disabled}
          onChange={handleChange}
          className="sr-only"
        />
      </div>
    );
  },
);
