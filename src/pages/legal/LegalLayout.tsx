import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

// Shared layout for legal/compliance pages: Offer, Privacy, Refund, Contacts.
// One source of truth for IP requisites in the footer.
//
// Requisites correspond to ИП Горлов Владислав Алексеевич (УСН), per
// official выписка из ЕГРИП. If any field changes (e.g. address), update
// this component only.

const LEGAL_NAV: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/offer", label: "Публичная оферта" },
  { to: "/privacy", label: "Политика конфиденциальности" },
  { to: "/refund", label: "Возврат средств" },
  { to: "/contacts", label: "Контакты" },
];

interface LegalLayoutProps {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}

export function LegalLayout({ title, effectiveDate, children }: LegalLayoutProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-sp-4 py-sp-2">
        <Link to="/" className="flex items-center" aria-label="ровно — на главную">
          <img src="/logo.svg" alt="ровно" className="h-8 w-auto" />
        </Link>
      </header>

      <main className="px-sp-3 py-sp-4 lg:px-sp-4 lg:py-sp-6">
        <div className="mx-auto w-full max-w-3xl space-y-sp-4">
          <nav aria-label="Legal navigation" className="flex flex-wrap gap-x-4 gap-y-2 text-body-sm">
            {LEGAL_NAV.map((item) => {
              const isActive = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "font-medium text-foreground underline underline-offset-4"
                      : "text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <header className="space-y-1">
            <h1 className="text-h1 text-foreground">{title}</h1>
            {effectiveDate ? (
              <p className="text-body-sm text-muted-foreground">Действует с {effectiveDate}</p>
            ) : null}
          </header>

          <article className="space-y-sp-3 text-body leading-relaxed text-foreground">
            {children}
          </article>
        </div>
      </main>

      <footer className="mt-sp-6 border-t border-border px-sp-3 py-sp-3">
        <div className="mx-auto w-full max-w-3xl space-y-1 text-caption text-muted-foreground">
          <div className="font-medium text-foreground">ИП Горлов Владислав Алексеевич</div>
          <div>ИНН 575309671587 · ОГРНИП 326470400066950</div>
          <div>
            Юр. адрес: 188824, Россия, Ленинградская обл., Выборгский р-н, п. Поляны,
            ул. Харалужная, д. 1
          </div>
          <div>
            Поддержка:{" "}
            <a href="mailto:vlad@rovno.ai" className="hover:text-foreground">
              vlad@rovno.ai
            </a>{" "}
            ·{" "}
            <a href="tel:+79215599969" className="hover:text-foreground">
              +7 (921) 559-99-69
            </a>
          </div>
          <div className="pt-2">
            <Link to="/" className="hover:text-foreground">
              ← На главную
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LegalLayout;
