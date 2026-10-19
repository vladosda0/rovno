import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBlogPreview } from "@/data/blog-preview-source";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));

const TOKEN = "v1.AAAAAAAAAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB";

function httpError(status: number) {
  return Object.assign(new Error(`status ${status}`), { context: new Response(null, { status }) });
}

function previewPost(overrides: Record<string, unknown> = {}) {
  return {
    title: "Смета на ремонт квартиры",
    subtitle: "Из чего она складывается",
    excerpt: "Коротко о главном.",
    content_html: "<p>Текст</p>",
    cover_image_url: "https://cdn.example/blog-images/shurik/abc.png",
    tags: ["смета"],
    reading_time_minutes: 13,
    word_count: 2380,
    author: { display_name: "Шурик", avatar_url: "https://rovno.ai/shurik/avatar.png", bio: "ИИ-инженер rovno.ai." },
    status: "draft",
    updated_at: "2026-10-16T09:00:00Z",
    published_url: null,
    ...overrides,
  };
}

describe("fetchBlogPreview", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("asks get-blog-preview with the token and returns the post", async () => {
    mockInvoke.mockResolvedValue({ data: { post: previewPost() }, error: null });

    const post = await fetchBlogPreview(TOKEN);

    expect(mockInvoke).toHaveBeenCalledWith("get-blog-preview", { body: { token: TOKEN } });
    expect(post).toEqual(previewPost());
  });

  it("keeps a published post with its public URL", async () => {
    mockInvoke.mockResolvedValue({
      data: { post: previewPost({ status: "published", published_url: "https://rovno.ai/blog/smeta/" }) },
      error: null,
    });

    const post = await fetchBlogPreview(TOKEN);

    expect(post?.status).toBe("published");
    expect(post?.published_url).toBe("https://rovno.ai/blog/smeta/");
  });

  it("fills absent nullable fields with null instead of rejecting the answer", async () => {
    const minimal = { title: "T", content_html: "<p>x</p>", status: "draft", updated_at: "2026-10-16T09:00:00Z" };
    mockInvoke.mockResolvedValue({ data: { post: minimal }, error: null });

    const post = await fetchBlogPreview(TOKEN);

    expect(post).toEqual({
      ...minimal,
      subtitle: null,
      excerpt: null,
      cover_image_url: null,
      tags: [],
      reading_time_minutes: null,
      word_count: null,
      author: null,
      published_url: null,
    });
  });

  it("does not call the function without a token", async () => {
    expect(await fetchBlogPreview("")).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it.each([404, 400])("treats a %s as a dead link (null)", async (status) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(status) });

    expect(await fetchBlogPreview(TOKEN)).toBeNull();
  });

  it.each([500, 502, 503])("throws on a %s so the page can offer a retry", async (status) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(status) });

    await expect(fetchBlogPreview(TOKEN)).rejects.toThrow(`status ${status}`);
  });

  it("throws on a network failure (no HTTP response at all)", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });

    await expect(fetchBlogPreview(TOKEN)).rejects.toThrow("Failed to send");
  });

  it("wraps a non-Error failure in an Error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: "boom" });

    await expect(fetchBlogPreview(TOKEN)).rejects.toThrow("boom");
  });

  it.each([
    ["no post key", {}],
    ["post is not an object", { post: "x" }],
    ["title missing", { post: previewPost({ title: undefined }) }],
    ["html not a string", { post: previewPost({ content_html: 1 }) }],
    ["unknown status", { post: previewPost({ status: "archived" }) }],
    ["updated_at missing", { post: previewPost({ updated_at: undefined }) }],
    ["tags not strings", { post: previewPost({ tags: [1] }) }],
    ["subtitle a number", { post: previewPost({ subtitle: 5 }) }],
    ["word count a string", { post: previewPost({ word_count: "2380" }) }],
    ["author without a name", { post: previewPost({ author: { avatar_url: null, bio: null } }) }],
  ])("treats a malformed answer (%s) as not found", async (_label, data) => {
    mockInvoke.mockResolvedValue({ data, error: null });

    expect(await fetchBlogPreview(TOKEN)).toBeNull();
  });
});
