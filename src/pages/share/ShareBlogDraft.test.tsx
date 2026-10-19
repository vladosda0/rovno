import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import ShareBlogDraft from "@/pages/share/ShareBlogDraft";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mockInvoke },
    rpc: vi.fn(),
  },
}));

// The landing chrome (nav, footer, demo CTA) is not what this page adds; it
// is BlogPostPage's shell, unchanged. Rendering it would drag the auth runtime
// into a test about the preview itself.
vi.mock("@/components/blog/BlogShell", () => ({
  BlogShell: ({ children }: { children: ReactNode }) => <div data-testid="blog-shell">{children}</div>,
}));

const TOKEN = "v1.AAAAAAAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB";

function renderPage(path = `/share/blog/${TOKEN}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/share/blog/:token" element={<ShareBlogDraft />} />
          <Route path="/share/blog/" element={<ShareBlogDraft />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function previewPost(overrides: Record<string, unknown> = {}) {
  return {
    title: "Смета на ремонт квартиры в 2026 году",
    subtitle: "Как составить и проверить",
    excerpt: "Коротко.",
    content_html:
      "<p>Вступление.</p><h2>Сколько стоят работы</h2>" +
      '<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup>' +
      '<tbody><tr><th colspan="1" rowspan="1"><p>Работа</p></th><th colspan="1" rowspan="1"><p>Цена</p></th></tr>' +
      '<tr><td colspan="1" rowspan="1"><p>Штукатурка</p></td><td colspan="1" rowspan="1"><p>700</p></td></tr></tbody></table>' +
      '<p>Конец.</p><script>window.__pwned = true</script><img src="x" onerror="window.__pwned = true">',
    cover_image_url: "https://cdn.example/blog-images/shurik/abc.png",
    tags: ["сметы"],
    reading_time_minutes: 13,
    word_count: 2380,
    author: {
      display_name: "Шурик",
      avatar_url: "https://rovno.ai/shurik/avatar.png",
      bio: "ИИ-инженер rovno.ai. Статьи готовит ИИ, каждую перед выходом читает и одобряет Влад Горлов.",
    },
    status: "draft",
    updated_at: "2026-10-16T09:00:00Z",
    published_url: null,
    ...overrides,
  };
}

function httpError(status: number) {
  return Object.assign(new Error(`status ${status}`), { context: new Response(null, { status }) });
}

function robotsMeta(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

describe("ShareBlogDraft", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"], script[type="application/ld+json"]')
      .forEach((node) => node.remove());
  });

  it("renders a draft the way the article page does, under the draft banner", async () => {
    mockInvoke.mockResolvedValue({ data: { post: previewPost() }, error: null });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Смета на ремонт квартиры в 2026 году" })).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get-blog-preview", { body: { token: TOKEN } });

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Черновик. Читатели его ещё не видят.");
    expect(banner).toHaveTextContent("Опубликовать или поправить можно в карточке в Telegram.");

    expect(screen.getByText("Как составить и проверить")).toBeInTheDocument();
    expect(screen.getByText(/13 мин чтения/)).toBeInTheDocument();
    expect(screen.getByText("#сметы")).toBeInTheDocument();
    expect(screen.getByAltText("Смета на ремонт квартиры в 2026 году")).toHaveAttribute(
      "src",
      "https://cdn.example/blog-images/shurik/abc.png",
    );

    // "Об авторе" at the end, with Shurik's own bio.
    expect(screen.getByText("Об авторе")).toBeInTheDocument();
    expect(screen.getByText(/каждую перед выходом читает и одобряет Влад Горлов/)).toBeInTheDocument();

    // The article body went through the same passes as BlogPostPage: the
    // sanitizer kept the table and dropped the script, and the anchor pass
    // gave the h2 an id.
    const article = container.querySelector(".rv-article");
    expect(article?.querySelector("table th")?.textContent).toBe("Работа");
    expect(article?.querySelector("script")).toBeNull();
    expect(article?.innerHTML).not.toMatch(/onerror/);
    expect(article?.querySelector("h2")?.getAttribute("id")).toBeTruthy();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("keeps the page out of search: noindex, no canonical, no JSON-LD", async () => {
    mockInvoke.mockResolvedValue({ data: { post: previewPost() }, error: null });

    renderPage();
    await screen.findByRole("heading", { level: 1 });

    await waitFor(() => expect(robotsMeta()).toBe("noindex, nofollow"));
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(document.title).toContain("черновик");
  });

  it("takes the static shell's canonical out while open and puts it back on leave", async () => {
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = "https://rovno.ai/";
    document.head.appendChild(canonical);
    mockInvoke.mockResolvedValue({ data: { post: previewPost() }, error: null });

    const { unmount } = renderPage();
    await screen.findByRole("heading", { level: 1 });

    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    unmount();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://rovno.ai/");
  });

  it("says a published article is live and links to it", async () => {
    mockInvoke.mockResolvedValue({
      data: { post: previewPost({ status: "published", published_url: "https://rovno.ai/blog/smeta-na-remont/" }) },
      error: null,
    });

    renderPage();

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Статья уже опубликована");
    expect(screen.getByRole("link", { name: "Открыть на сайте" })).toHaveAttribute(
      "href",
      "https://rovno.ai/blog/smeta-na-remont/",
    );
    expect(screen.queryByText(/Черновик\. Читатели/)).toBeNull();
    // The article itself still renders below the banner.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("never renders a non-http published_url as a link", async () => {
    mockInvoke.mockResolvedValue({
      data: { post: previewPost({ status: "published", published_url: "javascript:alert(1)" }) },
      error: null,
    });

    renderPage();

    expect(await screen.findByText("Статья уже опубликована")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Открыть на сайте" })).toBeNull();
  });

  it("shows the dead-link banner for the function's 404", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(404) });

    renderPage();

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Ссылка устарела или неверна.");
    expect(banner).toHaveTextContent("Свежая ссылка есть в последней карточке статьи.");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await waitFor(() => expect(robotsMeta()).toBe("noindex, nofollow"));
  });

  it("shows the dead-link banner without calling the function when the token is empty", async () => {
    renderPage("/share/blog/");

    expect(await screen.findByText("Ссылка устарела или неверна.")).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("tells a server failure from a dead link and retries on request", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(500) });

    renderPage();

    // The page retries once on its own (retry: 1, about a second) before it
    // gives up and shows the error.
    const alert = await screen.findByRole("alert", {}, { timeout: 4_000 });
    expect(alert).toHaveTextContent("Не удалось загрузить черновик. Попробуйте ещё раз.");
    expect(screen.queryByText("Ссылка устарела или неверна.")).toBeNull();

    const callsBefore = mockInvoke.mock.calls.length;
    mockInvoke.mockResolvedValue({ data: { post: previewPost() }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(mockInvoke.mock.calls.length).toBe(callsBefore + 1);
  });

  it("renders without an author, cover or subtitle", async () => {
    mockInvoke.mockResolvedValue({
      data: { post: previewPost({ author: null, cover_image_url: null, subtitle: null, tags: [] }) },
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Об авторе")).toBeNull();
    expect(screen.queryByAltText("Смета на ремонт квартиры в 2026 году")).toBeNull();
  });
});
