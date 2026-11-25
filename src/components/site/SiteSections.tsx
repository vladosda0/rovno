// Static sections of the new landing (designer's prototype, PR #337, with the
// approved edits of 2026-11-23). Pure markup: rendered at build time for
// crawlers (src/ssr/public-pages.tsx) and in the browser by pages/Landing.tsx.
import type { ReactNode } from "react";
import { PLANS } from "@/data/plans";
import { planDisplayName } from "@/data/plan-labels";
import { BILLING_ENABLED } from "@/lib/billing";
import { SiteButtonLink } from "./SiteButton";
import { DEMO_PATH, type SiteCta } from "./site-links";

export function SiteHero({ cta }: { cta: SiteCta }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">
          <span className="hero-title-first">
            <span>Управляйте</span> <span>стройкой,</span>
          </span>
          <span>а не хаосом.</span>
        </h1>
        <div className="hero-description">
          <p>
            Rovno объединяет задачи, смету, документы, подрядчиков и ход работ в одном рабочем пространстве. Всё,
            что нужно для управления объектом, находится в одной системе.
          </p>
          <div className="hero-actions">
            <SiteButtonLink variant="secondary" href={cta.startPath}>
              Начать бесплатно
            </SiteButtonLink>
            <SiteButtonLink href={DEMO_PATH}>
              <span className="desktop-copy">Посмотреть демо</span>
              <span className="compact-copy">Демо</span>
            </SiteButtonLink>
          </div>
        </div>
      </div>
      <div className="hero-illustration">
        <picture className="hero-shadows" aria-hidden="true">
          <source media="(max-width: 743px)" srcSet="/site/hero/shadows-mobile.svg" />
          <source media="(max-width: 1279px)" srcSet="/site/hero/shadows-tablet.svg" />
          <img src="/site/hero/shadows-desktop.svg" alt="" />
        </picture>
        <div className="hero-screen">
          <img
            src="/site/hero/product-screen.webp"
            width="2400"
            height="1346"
            {...{ fetchpriority: "high" }}
            alt="Рабочее пространство Rovno: объект «Дом из газобетона, 142 м²», задачи, бюджет, документы, галерея и участники."
          />
        </div>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { icon: "telephone", title: "Чтобы узнать статус объекта", description: "...приходится звонить." },
  { icon: "chat", title: "Чтобы найти документ", description: "...нужно открыть несколько чатов или папок." },
  { icon: "image", title: "Фотографии объекта", description: "...хранятся отдельно от замечаний." },
  { icon: "table", title: "Перед планёркой", description: "...информацию приходится собирать вручную." },
];

export function SiteProblem() {
  return (
    <section className="problem" id="problem" aria-labelledby="problem-title">
      <h2 id="problem-title">Большинство строительных компаний работают именно так</h2>
      <div className="problem-content">
        <ul className="problem-cards">
          {PROBLEMS.map(({ icon, title, description }) => (
            <li className="problem-card" key={icon}>
              <div className="problem-card-content">
                <div className="problem-icon">
                  <img src={`/site/problem/${icon}.svg`} width="24" height="24" alt="" />
                </div>
                <div className="problem-text">
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </div>
              <span className="problem-divider" aria-hidden="true" />
            </li>
          ))}
        </ul>
        <p className="problem-caption">
          И это нормально. <strong>До тех пор</strong>,<br className="problem-caption-break" /> пока проект не начинает
          расти.
        </p>
      </div>
    </section>
  );
}

interface Feature {
  id: string;
  className: string;
  title: ReactNode;
  text: string;
  image: string;
  alt: string;
  size?: [number, number];
}

const FEATURES: Feature[] = [
  {
    id: "features",
    className: "",
    title: "Один объект, одно рабочее пространство",
    text: "Каждый проект начинается с единого центра управления. Вся информация об объекте собирается в одном месте: прогресс, задачи, бюджет, документы, фотографии и команда.",
    image: "/site/hero/product-screen.webp",
    alt: "Обзор объекта в Rovno: прогресс стройки, быстрые действия, задачи, бюджет, документы и фото с объекта.",
    size: [2400, 1346],
  },
  {
    id: "planning",
    className: "planning-feature",
    title: (
      <>
        <span className="planning-first-line">Планируйте работы{"  "}</span>
        <span>и контролируйте сроки</span>
      </>
    ),
    text: "Создавайте задачи, назначайте исполнителей и следите за выполнением работ без постоянных уточнений в чатах.",
    image: "/site/features/tasks-screen.webp",
    alt: "Задачи в Rovno: этапы работ и канбан-доска со статусами «Не начата», «В работе», «Готово» и «Заблокирована».",
  },
  {
    id: "issues",
    className: "issues-feature",
    title: "Каждое замечание находится под контролем",
    text: "Фиксируйте замечания, прикладывайте фотографии, назначайте ответственных и отслеживайте выполнение прямо внутри проекта.",
    image: "/site/features/issues-screen.webp",
    alt: "Карточка задачи в Rovno: статус, описание, исполнитель, дедлайн, чек-лист и фото с объекта.",
  },
  {
    id: "budget",
    className: "budget-feature",
    title: "Бюджет всегда перед глазами",
    text: "Контролируйте бюджет проекта, отслеживайте расходы и анализируйте прибыль без дополнительных таблиц.",
    image: "/site/features/budget-screen.webp",
    alt: "Смета проекта в Rovno: выручка, себестоимость, маржа и сроки, работы по этапам.",
  },
  {
    id: "documents",
    className: "documents-feature",
    title: "Все документы в одном месте",
    text: "Чертежи, договоры, акты и инструкции всегда доступны команде. Больше не нужно искать актуальную версию в переписках.",
    image: "/site/features/documents-screen.webp",
    alt: "Документы проекта в Rovno: договор, смета, чертёж, платёжное поручение, акт и технические условия.",
  },
  {
    id: "team",
    className: "team-feature",
    title: "Вся команда работает с одной информацией",
    text: "Прораб, инженер, подрядчик и заказчик видят актуальные данные по объекту и работают в едином рабочем пространстве.",
    image: "/site/features/team-screen.webp",
    alt: "Участники проекта в Rovno: команда, приглашения, роли и права доступа.",
  },
];

export function SiteFeatures() {
  return (
    <>
      {FEATURES.map((feature) => {
        const screen = feature.className ? `${feature.className.replace("-feature", "-screen")}` : "";
        return (
          <section
            key={feature.id}
            className={`workspace-feature ${feature.className}`.trim()}
            id={feature.id}
            aria-labelledby={`${feature.id}-title`}
          >
            <div className="workspace-copy">
              <h2 id={`${feature.id}-title`}>{feature.title}</h2>
              <p>{feature.text}</p>
            </div>
            <div className={`workspace-screen ${screen}`.trim()}>
              <div className="workspace-screen-crop">
                <img
                  src={feature.image}
                  width={feature.size?.[0]}
                  height={feature.size?.[1]}
                  loading="lazy"
                  alt={feature.alt}
                />
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}

const AUDIENCES = [
  {
    title: "Прорабы и бригады",
    text: "Ведите задачи, смету и закупки по всем объектам и не теряйте договорённости в чатах.",
    image: "08784",
    alt: "Два помощника Шурика несут материалы рядом со списком задач.",
  },
  {
    title: "Частные мастера",
    text: "Смета, фото работ и документы для заказчика в одном месте, прямо с телефона.",
    image: "6ea77",
    alt: "Шурик с лупой проверяет трещину в стене.",
  },
  {
    title: "Заказчики ремонта",
    text: "Видите, что сделано, сколько потрачено и что дальше, без звонков прорабу.",
    image: "d5c2e",
    alt: "Шурик анализирует показатели строительства на экране.",
  },
  {
    title: "Строительные компании",
    text: "Несколько объектов, команды и подрядчики в одной системе, с общими документами.",
    image: "a3d99",
    alt: "Шурик с планшетом руководит строительством объекта.",
  },
];

export function SiteAudience() {
  return (
    <section className="audience-section" id="audience" aria-labelledby="audience-title">
      <h2 id="audience-title">Создано для тех, кто управляет строительством</h2>
      <div className="audience-grid">
        {AUDIENCES.map((item, index) => (
          <article className="audience-card" key={item.image}>
            <div className={`audience-image${index === 1 ? " audience-image--supervision" : ""}`}>
              <img src={`/site/audience/${item.image}.webp`} loading="lazy" alt={item.alt} />
            </div>
            <div className="audience-copy">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// Plan items: one value per item, selected with Vlad on 2026-11-23
// (https://claude.ai/artifact/6A3Hwa6rSXKn7AhbZFyrHV, draft 3) plus
// «Финансы и аналитика по всем объектам» for Мастер. No struck-through prices
// until the designer draws them. Prices come from the catalog (PLANS).
export const SITE_PLANS = [
  {
    code: "free",
    description: "Попробовать на одном объекте.",
    metric: "Только вы в проекте",
    plus: "Что входит:",
    features: ["1 смета", "3 проверки смет и документов ИИ в месяц", "50 вопросов ИИ-ассистенту в месяц"],
  },
  {
    code: "master",
    description: "Для частного мастера.",
    metric: "2 участника в проекте",
    plus: "Всё из Старта, плюс:",
    features: [
      "Безлимит смет",
      "Финансы и аналитика по всем объектам",
      "15 проверок смет и документов ИИ в месяц",
      "500 вопросов ИИ-ассистенту, в том числе в Telegram и MAX",
      "Безлимит гостей",
    ],
  },
  {
    code: "brigade",
    description: "Для подрядчика и стройкомпании.",
    metric: "Безлимит участников",
    plus: "Всё из Мастера, плюс:",
    features: [
      "150 проверок смет и документов ИИ в месяц",
      "2 000 вопросов ИИ-ассистенту в месяц",
      "Своя организация с общими документами",
      "Новинки раньше всех",
      "ИИ собирает акты и допсоглашения · Скоро",
      "ИИ-маркетолог продвигает компанию · Скоро",
    ],
  },
] as const;

export type SitePlanCode = (typeof SITE_PLANS)[number]["code"];

/** «2 990» with a no-break space, from the catalog price in kopecks. */
export function formatPlanPrice(code: SitePlanCode): string {
  const rubles = Math.round((PLANS[code]?.amount_kopecks ?? 0) / 100);
  return rubles.toLocaleString("ru-RU").replace(/\s/g, " ");
}

/** While online payment is off, a paid plan leads to the billing settings, as before. */
export function planHref(code: SitePlanCode, cta: SiteCta, billingEnabled = BILLING_ENABLED): string {
  if (code === "free") return cta.startPath;
  const destination = billingEnabled ? `/billing/checkout?plan=${code}` : "/settings?tab=billing";
  return cta.signedIn ? destination : `/auth/signup?next=${encodeURIComponent(destination)}`;
}

export function SitePricing({ cta, onPlanClick }: { cta: SiteCta; onPlanClick?: (code: SitePlanCode) => void }) {
  return (
    <section className="pricing-section" id="pricing" aria-labelledby="pricing-title">
      <div className="pricing-copy">
        <h2 id="pricing-title">Выберите подходящий тариф</h2>
        <p>
          Начните бесплатно и переходите на более функциональный тариф по мере роста вашей команды и количества
          проектов.
        </p>
      </div>
      <div className="pricing-grid">
        {SITE_PLANS.map((plan, index) => {
          const name = planDisplayName(plan.code);
          return (
            <article className={`plan-card plan-card--${index}`} key={plan.code} aria-labelledby={`plan-${index}`}>
              <div className="plan-top">
                <div className="plan-intro">
                  <div className="plan-title">
                    <h3 id={`plan-${index}`}>{name}</h3>
                    {index === 1 && <span className="plan-badge">Рекомендуем</span>}
                  </div>
                  <p>{plan.description}</p>
                </div>
                <p className="plan-price">
                  <span>{formatPlanPrice(plan.code)}</span>
                  <small>рублей / месяц</small>
                </p>
              </div>
              <div className="plan-rule" aria-hidden="true" />
              <div className="plan-bottom">
                <p className="plan-metric">{plan.metric}</p>
                <p className="plan-plus">{plan.plus}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature} className={feature.includes("Скоро") ? "plan-feature--soon" : undefined}>
                      <img src="/site/pricing/fc4c2.svg" alt="" width="24" height="24" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <SiteButtonLink
                  href={planHref(plan.code, cta)}
                  variant={index === 1 ? "primary" : "secondary"}
                  aria-label={`Продолжить с тарифом «${name}»`}
                  onClick={onPlanClick ? () => onPlanClick(plan.code) : undefined}
                >
                  Продолжить
                </SiteButtonLink>
              </div>
              <div className="plan-vertical" aria-hidden="true">
                <span />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    question: "Нужно ли заставлять всю команду переходить в Rovno сразу?",
    answer:
      "Нет. Начните с одного объекта или одного процесса, например, постановки задач или работы с документами. Команда сможет постепенно перейти на единое рабочее пространство без резких изменений привычных процессов.",
  },
  {
    question: "Мы уже используем другую систему. Есть ли смысл переходить?",
    answer:
      "Если текущая система действительно закрывает все ваши процессы, менять её нет необходимости. Но если часть работы по-прежнему ведётся в чатах, таблицах или по телефону, Rovno поможет собрать всё в одном месте и сократить количество ручной работы.",
  },
  {
    question: "Подходит ли Rovno для нескольких объектов одновременно?",
    answer: "Да. Вы можете вести несколько объектов, переключаться между ними и контролировать каждый проект из единой системы.",
  },
  {
    question: "Можно ли пригласить заказчика или подрядчика?",
    answer: "Да. Вы сами определяете, кто имеет доступ к проекту и какую информацию видит каждый участник.",
  },
];

export function SiteFaq() {
  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-title">
      <div className="faq-heading">
        <h2 id="faq-title">Часто задаваемые вопросы</h2>
        <div className="faq-contact">
          <p>Если вы не нашли ответ на свой вопрос — напишите нам, мы поможем.</p>
          <SiteButtonLink variant="secondary" href="mailto:vlad@rovno.ai">
            Написать нам
          </SiteButtonLink>
        </div>
      </div>
      <div className="faq-list">
        {QUESTIONS.map((item, index) => (
          <article className="faq-item" key={item.question} aria-labelledby={`faq-question-${index}`}>
            <span className="faq-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="faq-answer">
              <h3 id={`faq-question-${index}`}>{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export interface SiteBlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt?: string | null;
  readonly subtitle?: string | null;
  readonly cover_image_url?: string | null;
  readonly published_at?: string | null;
  readonly reading_time_minutes?: number | null;
}

function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" }).replace(/\s*г\.$/, "");
}

/** Three latest articles from blog_posts; nothing while there are none. */
export function SiteBlog({ posts }: { posts: readonly SiteBlogPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="blog-section" id="blog" aria-labelledby="blog-title">
      <div className="blog-heading">
        <h2 id="blog-title">Полезные материалы для строительных команд</h2>
        <div className="blog-intro">
          <p>Практические статьи о цифровизации строительства, управлении проектами и организации работы на объектах.</p>
          <SiteButtonLink href="/blog/" variant="secondary">
            Смотреть все статьи
          </SiteButtonLink>
        </div>
      </div>
      <div className="blog-posts" tabIndex={0} role="region" aria-label="Статьи блога, горизонтальная прокрутка">
        {posts.slice(0, 3).map((post) => {
          const text = post.excerpt ?? post.subtitle;
          return (
            <article className="blog-card" key={post.slug}>
              <a className="blog-card-link" href={`/blog/${post.slug}/`}>
                <div className="blog-cover-frame" aria-hidden="true">
                  {post.cover_image_url ? (
                    <img className="blog-cover" src={post.cover_image_url} alt="" loading="lazy" style={{ objectFit: "cover" }} />
                  ) : (
                    <div className="blog-cover" />
                  )}
                </div>
                <div className="blog-card-copy">
                  <div className="blog-labels">
                    {post.published_at && <time dateTime={post.published_at}>{formatPostDate(post.published_at)}</time>}
                    {post.reading_time_minutes ? <span>{post.reading_time_minutes} мин чтения</span> : null}
                  </div>
                  <div className="blog-text">
                    <h3>{post.title}</h3>
                    {text && <p>{text}</p>}
                  </div>
                </div>
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function SiteFinalCta({ cta }: { cta: SiteCta }) {
  return (
    <section className="final-cta" id="start" aria-labelledby="final-cta-title">
      <div className="final-cta-content">
        <div className="final-cta-copy">
          <h2 id="final-cta-title">Попробуйте Rovno бесплатно</h2>
          <p>
            Создайте первый объект за несколько минут и посмотрите, насколько проще управлять строительством, когда
            вся информация находится в одном месте.
          </p>
        </div>
        <div className="final-cta-buttons">
          <SiteButtonLink href={cta.startPath} variant="tertiary">
            Начать бесплатно
          </SiteButtonLink>
          <SiteButtonLink href={DEMO_PATH} variant="white">
            Посмотреть демо
          </SiteButtonLink>
        </div>
      </div>
      <img className="final-cta-bricks" src="/site/cta/bricks.webp" loading="lazy" alt="" />
      <img className="final-cta-shurik" src="/site/cta/shurik.webp" loading="lazy" alt="Шурик с планшетом." />
    </section>
  );
}
