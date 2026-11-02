import { Trans } from "react-i18next";

const linkClass = "underline hover:text-foreground";

/** The offer and privacy consent line under the sign-up and Yandex buttons. */
export function LegalConsent({ i18nKey }: { i18nKey: string }) {
  return (
    <p className="text-center text-caption text-muted-foreground">
      <Trans
        i18nKey={i18nKey}
        components={{
          offer: <a href="/offer" target="_blank" rel="noopener noreferrer" className={linkClass} />,
          privacy: <a href="/privacy" target="_blank" rel="noopener noreferrer" className={linkClass} />,
        }}
      />
    </p>
  );
}
