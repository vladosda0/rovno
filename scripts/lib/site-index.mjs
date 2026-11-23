// What crawlers and agents read about the site besides the pages themselves:
// the static sitemap routes and llms.txt (site-redesign 1.8). Used by
// scripts/prerender-blog.mjs; pure, so vitest checks it directly.

export const SITE_ORIGIN = "https://rovno.ai";
export const SITE_NAME = "Ровно";

// Trailing slashes are the canonical form for everything served out of a
// directory: Caddy resolves dist/<route>/index.html for both /offer and
// /offer/, 308-ing the bare form to the slashed one. Advertising the bare form
// here would put a redirecting URL in the sitemap. /baza/ and its pages are
// appended by prerender-kb.mjs.
export const STATIC_ROUTES = ["/", "/blog/", "/offer/", "/privacy/", "/refund/", "/contacts/"];

// Mirrors SITE_SOCIAL_LINKS in src/components/site/site-data.ts (public ones).
const SOCIALS = [
  ["Telegram, Ровно", "https://t.me/stroyrovno"],
  ["ВКонтакте, Ровно", "https://vk.ru/rovnoai"],
  ["Дзен, Ровно", "https://dzen.ru/id/69f8bd40ef3f37622df5b5ee"],
  ["Telegram, Шурик, ИИ-эксперт Ровно", "https://t.me/ai_v_stroike"],
  ["Threads, Шурик, ИИ-эксперт Ровно", "https://www.threads.com/@rovno_ai"],
];

export function llmsTxt(posts) {
  const lines = [
    `# ${SITE_NAME} (rovno.ai)`,
    "",
    "> Ровно — рабочее пространство стройки: задачи, смета, документы, подрядчики",
    "> и ход работ в одном месте, ИИ-ассистент проверяет сметы и документы.",
    "> Для прорабов и бригад, частных мастеров, заказчиков ремонта и строительных компаний в России.",
    "",
    "## Продукт",
    `- [Главная](${SITE_ORIGIN}/): что делает Ровно`,
    `- [Тарифы](${SITE_ORIGIN}/#pricing): Старт / Мастер / Бригада — 0, 990 ₽ и 2 990 ₽ в месяц`,
    `- [База знаний](${SITE_ORIGIN}/baza/): нормативы, СП, ГОСТ и законы о стройке, открыты без входа`,
    "",
    "## Блог — статьи о стройке",
    `- [Все статьи](${SITE_ORIGIN}/blog/)`,
    `- [RSS](${SITE_ORIGIN}/blog/feed.xml)`,
  ];
  for (const post of posts) {
    const desc = (post.seo_description ?? post.excerpt ?? "").replace(/\s+/g, " ").trim();
    lines.push(`- [${post.title}](${SITE_ORIGIN}/blog/${post.slug}/)${desc ? `: ${desc}` : ""}`);
  }
  lines.push(
    "",
    "## Правовая информация",
    `- [Публичная оферта](${SITE_ORIGIN}/offer/)`,
    `- [Политика конфиденциальности](${SITE_ORIGIN}/privacy/)`,
    `- [Возврат средств](${SITE_ORIGIN}/refund/)`,
    `- [Контакты](${SITE_ORIGIN}/contacts/)`,
    "",
    "## Соцсети",
    ...SOCIALS.map(([name, href]) => `- [${name}](${href})`),
    "",
    "## Контакты",
    "- Email: vlad@rovno.ai",
    "",
  );
  return lines.join("\n");
}
