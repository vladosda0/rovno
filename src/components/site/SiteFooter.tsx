// Site footer from the designer's prototype (PR #337, components/Footer.tsx)
// with the approved edits of 2026-11-23: socials in one column as
// «name · group» rows on the shared row grid, no subheadings; the bottom row
// with the requisites is visible; «Настройки cookie» kept (rovno#333).
import { openCookieSettings } from "@/lib/cookie-consent";
import { SITE_REQUISITES, visibleSocialLinks } from "./site-data";
import { SITE_NAVIGATION } from "./site-links";

const PAYMENTS = [
  ["169ff", "Visa", 74],
  ["d2ae7", "Mastercard", 39],
  ["8cdfb", "МИР", 80],
  ["8cd0b", "СБП", 48],
  ["f6dfd", "T-Pay", 58],
  ["f3a08", "SberPay", 51],
  ["90f53", "Альфа Pay", 112],
] as const;

const LEGAL_LINKS = [
  ["Публичная оферта", "/offer/"],
  ["Политика конфиденциальности", "/privacy/"],
  ["Возврат средств", "/refund/"],
  ["Контакты", "/contacts/"],
] as const;

function Logo() {
  return (
    <a className="footer-logo" href="/" aria-label="Ровно — на главную">
      <span>
        <img src="/site/footer/dfec3.webp" width="192" height="192" alt="" />
      </span>
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="landing-footer" id="footer">
      <div className="footer-top">
        <nav className="footer-navigation" aria-label="Навигация в подвале">
          <div className="footer-column">
            <h2>Продукт</h2>
            <ul>
              {SITE_NAVIGATION.map((item) => (
                <li key={item.label}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer-column">
            <h2>Социальные сети</h2>
            <ul>
              {visibleSocialLinks().map((link) => (
                <li key={`${link.name}-${link.group}`}>
                  <a href={link.href ?? undefined} target="_blank" rel="noopener noreferrer">
                    {link.name}
                  </a>{" "}
                  <span className="footer-social-group">{link.group}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer-column footer-legal">
            <h2>Правовая информация</h2>
            <ul>
              {LEGAL_LINKS.map(([label, href]) => (
                <li key={href}>
                  <a href={href}>{label}</a>
                </li>
              ))}
              <li>
                {/* Opens «Настройки cookie» in place (rovno#333); a button, since it goes nowhere. */}
                <button type="button" className="footer-cookie-settings" onClick={openCookieSettings}>
                  Настройки cookie
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <div className="footer-top-logo">
          <Logo />
        </div>
      </div>
      <div className="footer-rule" aria-hidden="true" />
      <div className="footer-payments">
        <div className="footer-payment-logos">
          {PAYMENTS.map(([file, name, width]) => (
            <img key={file} src={`/site/footer/${file}.webp`} alt={name} width={width} height="24" loading="lazy" />
          ))}
        </div>
        <div className="footer-processor">
          <span>Платежи обрабатывает</span>
          <img src="/site/footer/23450.webp" alt="Т-Банк" width="67" height="24" loading="lazy" />
        </div>
      </div>
      <div className="footer-rule" aria-hidden="true" />
      <div className="footer-bottom">
        <div className="footer-copyright">
          <div className="footer-bottom-logo">
            <Logo />
          </div>
          <p>© 2026 ровно</p>
        </div>
        <div className="footer-requisites" id="footer-requisites">
          <p>{SITE_REQUISITES.shortName}</p>
          <p>ИНН {SITE_REQUISITES.inn}</p>
        </div>
      </div>
    </footer>
  );
}
