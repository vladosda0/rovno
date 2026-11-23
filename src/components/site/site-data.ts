// One source for the public site's facts: socials (footer + JSON-LD sameAs),
// requisites (footer + Organization JSON-LD) and the per-route head of the
// prerendered public pages (site-redesign, slice 1). Plain data, no imports:
// it is read by the browser bundle, the SSR build and scripts/prerender-public.mjs.

export const SITE_ORIGIN = "https://rovno.ai";
export const SITE_NAME = "Ровно";

export interface SiteSocialLink {
  readonly name: string;
  readonly group: "Ровно" | "Шурик, ИИ-эксперт";
  /** null while the profile has no public address: the link is not shown. */
  readonly href: string | null;
}

// Two groups by Vlad's decision 2026-11-23 (brainstorm round 1). MAX has no
// public channel link yet (epic section 6): it stays hidden, not a dead button.
export const SITE_SOCIAL_LINKS: readonly SiteSocialLink[] = [
  { name: "Telegram", group: "Ровно", href: "https://t.me/stroyrovno" },
  { name: "ВКонтакте", group: "Ровно", href: "https://vk.ru/rovnoai" },
  { name: "Дзен", group: "Ровно", href: "https://dzen.ru/id/69f8bd40ef3f37622df5b5ee" },
  { name: "Telegram", group: "Шурик, ИИ-эксперт", href: "https://t.me/ai_v_stroike" },
  { name: "MAX", group: "Шурик, ИИ-эксперт", href: null },
  { name: "Threads", group: "Шурик, ИИ-эксперт", href: "https://www.threads.com/@rovno_ai" },
];

export const visibleSocialLinks = (): SiteSocialLink[] =>
  SITE_SOCIAL_LINKS.filter((link) => link.href !== null);

// Same requisites as src/pages/legal/LegalLayout.tsx (ЕГРИП extract).
export const SITE_REQUISITES = {
  shortName: "ИП Горлов В. А.",
  legalName: "ИП Горлов Владислав Алексеевич",
  inn: "575309671587",
  ogrnip: "326470400066950",
  postalCode: "188824",
  region: "Ленинградская обл.",
  locality: "п. Поляны, Выборгский р-н",
  street: "ул. Харалужная, д. 1",
  email: "vlad@rovno.ai",
  telephone: "+79215599969",
} as const;

export interface PublicRouteHead {
  readonly route: "/" | "/offer/" | "/privacy/" | "/refund/" | "/contacts/";
  readonly title: string;
  readonly description: string;
  /** Last crumb of the BreadcrumbList; the landing has none. */
  readonly crumb: string | null;
}

export const PUBLIC_ROUTE_HEADS: readonly PublicRouteHead[] = [
  {
    route: "/",
    title: "Ровно — управляйте стройкой, а не хаосом",
    description:
      "Задачи, смета, документы, подрядчики и ход работ в одном рабочем пространстве. ИИ-ассистент проверяет сметы и документы. Начать можно бесплатно.",
    crumb: null,
  },
  {
    route: "/offer/",
    title: "Публичная оферта — Ровно",
    description:
      "Условия договора на доступ к сервису Ровно: тарифы и оплата, автопродление подписки, возврат, ответственность сторон и реквизиты исполнителя.",
    crumb: "Публичная оферта",
  },
  {
    route: "/privacy/",
    title: "Политика конфиденциальности — Ровно",
    description:
      "Как Ровно обрабатывает персональные данные: что собираем и зачем, сколько храним, кому передаём, cookie и права пользователя по 152-ФЗ.",
    crumb: "Политика конфиденциальности",
  },
  {
    route: "/refund/",
    title: "Возврат средств — Ровно",
    description:
      "Как вернуть деньги за подписку Ровно: в какие сроки, как обратиться и как считается сумма возврата.",
    crumb: "Возврат средств",
  },
  {
    route: "/contacts/",
    title: "Контакты — Ровно",
    description:
      "Контакты Ровно: почта и телефон поддержки, часы работы, реквизиты и юридический адрес ИП Горлов В. А.",
    crumb: "Контакты",
  },
];

export function publicRouteHead(route: string): PublicRouteHead | null {
  return PUBLIC_ROUTE_HEADS.find((head) => head.route === route) ?? null;
}

/** Organization: requisites and every public profile (sameAs). */
export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    alternateName: ["Rovno", "Ровно ИИ"],
    legalName: SITE_REQUISITES.legalName,
    url: `${SITE_ORIGIN}/`,
    logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/rovno-logo.png` },
    email: SITE_REQUISITES.email,
    telephone: SITE_REQUISITES.telephone,
    taxID: SITE_REQUISITES.inn,
    identifier: { "@type": "PropertyValue", propertyID: "ОГРНИП", value: SITE_REQUISITES.ogrnip },
    address: {
      "@type": "PostalAddress",
      postalCode: SITE_REQUISITES.postalCode,
      addressCountry: "RU",
      addressRegion: SITE_REQUISITES.region,
      addressLocality: SITE_REQUISITES.locality,
      streetAddress: SITE_REQUISITES.street,
    },
    sameAs: visibleSocialLinks().map((link) => link.href),
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    inLanguage: "ru-RU",
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}

export function breadcrumbJsonLd(head: PublicRouteHead): Record<string, unknown> | null {
  if (!head.crumb) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE_ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: head.crumb, item: `${SITE_ORIGIN}${head.route}` },
    ],
  };
}

/** JSON-LD blocks of a public route: Organization everywhere, WebSite on the
 * landing, BreadcrumbList on the legal pages. */
export function publicRouteJsonLd(head: PublicRouteHead): Record<string, unknown>[] {
  const blocks = [organizationJsonLd()];
  if (head.route === "/") blocks.push(websiteJsonLd());
  const crumbs = breadcrumbJsonLd(head);
  if (crumbs) blocks.push(crumbs);
  return blocks;
}
