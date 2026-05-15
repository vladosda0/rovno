// Renders supported payment system logos and a T-Bank attribution badge.
//
// Required by T-Bank acquirer (requirements 1.2 and 1.3 from
// docs-requirements-for-online-store.pdf):
//   - изображения с логотипами ПС, карты которых принимаются Предприятием;
//   - изображение с логотипом Банка, T-Pay и URL ссылкой на ресурсы Банка: tbank.ru.
//
// Visual sizing notes
// -------------------
// Каждый бренд-SVG имеет свой viewBox и плотность заполнения. Чтобы
// логотипы выглядели визуально одной высоты в одной линии футера, каждому
// задаётся индивидуальный CSS-класс высоты. Baseline — Т-Банк h-6 (24px),
// под него подогнаны остальные. Если поменяешь baseline — пересчитай.

type Logo = {
  src: string;
  alt: string;
  /** Tailwind height class, подобран эмпирически под визуальный паритет с T-Bank h-6. */
  heightClass: string;
  /** Доп. tailwind-классы (например rounded-full для AlfaPay pill). */
  extraClass?: string;
};

const SUPPORTED_LOGOS: ReadonlyArray<Logo> = [
  // viewBox у visa.svg обрезан до контента.
  { src: "/payment-logos/visa.svg", alt: "Visa", heightClass: "h-5" },
  // viewBox у mastercard.svg обрезан до кругов.
  { src: "/payment-logos/mastercard.svg", alt: "Mastercard", heightClass: "h-6" },
  // MIR — толстые буквы во весь viewBox; визуально воспринимается крупнее.
  { src: "/payment-logos/mir.svg", alt: "МИР", heightClass: "h-4" },
  // SBP — комплексная композиция (треугольник + текст + подпись), даём чуть меньше.
  { src: "/payment-logos/sbp.svg", alt: "СБП — Система быстрых платежей", heightClass: "h-5" },
  // T-Pay — компактный shield.
  { src: "/payment-logos/tpay.svg", alt: "T-Pay", heightClass: "h-6" },
  // SberPay — pill shape во весь viewBox.
  { src: "/payment-logos/sberpay.svg", alt: "SberPay", heightClass: "h-6" },
  // AlfaPay — pill-shape rect с rounded ends. CSS-clip как fallback на случай
  // если кеш браузера не подхватит обновлённый SVG.
  { src: "/payment-logos/alfapay.svg", alt: "Alfa Pay", heightClass: "h-6", extraClass: "rounded-full" },
];

interface PaymentLogosProps {
  className?: string;
}

export function PaymentLogos({ className }: PaymentLogosProps) {
  return (
    <ul
      className={`flex flex-wrap items-center gap-3 ${className ?? ""}`.trim()}
      aria-label="Принимаемые способы оплаты"
    >
      {SUPPORTED_LOGOS.map((logo) => (
        <li key={logo.alt} className="flex items-center">
          <img
            src={logo.src}
            alt={logo.alt}
            className={`${logo.heightClass} w-auto shrink-0 ${logo.extraClass ?? ""}`.trim()}
            loading="lazy"
            decoding="async"
          />
        </li>
      ))}
    </ul>
  );
}

interface TBankAttributionProps {
  className?: string;
}

/**
 * Renders the T-Bank acquirer attribution: text + clickable logo linking to
 * https://www.tbank.ru. Required by acquirer rule 1.3.
 */
export function TBankAttribution({ className }: TBankAttributionProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`.trim()}>
      <span className="text-caption text-muted-foreground">Платежи на сайте обрабатывает</span>
      <a
        href="https://www.tbank.ru"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:opacity-80"
        aria-label="АО ТБанк — официальный сайт"
      >
        <img
          src="/payment-logos/tbank.svg"
          alt="Т-Банк"
          className="h-6 w-auto"
          loading="lazy"
          decoding="async"
        />
      </a>
    </div>
  );
}

export default PaymentLogos;
