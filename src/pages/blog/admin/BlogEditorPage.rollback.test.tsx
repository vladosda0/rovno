import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

const TEXT = "one two three four five six seven eight nine ten eleven twelve";
vi.mock("@/components/blog/editor/RichTextEditor", () => ({
  RichTextEditor: ({ onReady }: { onReady: (editor: unknown) => void }) => {
    useEffect(() => {
      onReady({ getText: () => TEXT, getJSON: () => ({}), getHTML: () => `<p>${TEXT}</p>` });
    }, [onReady]);
    return <div data-testid="rich-text-editor" />;
  },
}));

vi.mock("@/lib/blog/api", () => ({
  fetchPublishedPosts: vi.fn(),
  fetchPostBySlug: vi.fn(),
  fetchPostById: vi.fn(),
  fetchAllPostsForAdmin: vi.fn(),
  fetchMyBlogAuthor: vi.fn(),
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  triggerFrontendRebuild: vi.fn(),
  uploadBlogImage: vi.fn(),
  BLOG_IMAGES_BUCKET: "blog-images",
}));

import BlogEditorPage from "@/pages/blog/admin/BlogEditorPage";
import {
  createBlogPost,
  fetchMyBlogAuthor,
  fetchPostById,
  triggerFrontendRebuild,
  updateBlogPost,
} from "@/lib/blog/api";
import { slugifyTitle } from "@/lib/blog/slug";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { BlogPostWithAuthor } from "@/lib/blog/types";

function post(status: "draft" | "published"): BlogPostWithAuthor {
  return {
    id: "post-1",
    author_id: "author-1",
    slug: "kak-schitat-smetu",
    title: "Как считать смету",
    subtitle: null,
    excerpt: null,
    content: {},
    content_html: "",
    cover_image_url: null,
    seo_title: null,
    seo_description: null,
    tags: [],
    locale: "ru",
    status,
    published_at: status === "published" ? "2026-08-01T10:00:00.000Z" : null,
    reading_time_minutes: 3,
    word_count: 400,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-02T10:00:00.000Z",
    author: { id: "author-1", display_name: "Влад", avatar_url: null, bio: null },
  } as unknown as BlogPostWithAuthor;
}

function renderEditor(path = "/blog/admin/post-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/blog/admin/new" element={<BlogEditorPage />} />
          <Route path="/blog/admin/:id" element={<BlogEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function publishedAtOfCall(index: number): unknown {
  return ((updateBlogPost as Mock).mock.calls[index][1] as { published_at?: unknown }).published_at;
}

describe("BlogEditorPage keeps the server's status when a status write fails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateRuntimeAuth();
    (fetchMyBlogAuthor as Mock).mockResolvedValue({ id: "author-1", profile_id: "profile-1" });
    (triggerFrontendRebuild as Mock).mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the post as published again after a failed unpublish", async () => {
    (fetchPostById as Mock).mockResolvedValue(post("published"));
    (updateBlogPost as Mock).mockRejectedValue(new Error("upstream 503"));
    renderEditor();
    fireEvent.click(await screen.findByText("Снять с публикации"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Не удалось снять с публикации" }),
      ),
    );
    expect(screen.getByText("Опубликовано")).toBeInTheDocument();
    expect(screen.getByText("Снять с публикации")).toBeInTheDocument();
    expect(triggerFrontendRebuild).not.toHaveBeenCalled();
  });

  it("shows the post as a draft again after a failed publish and dates the next attempt anew", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));
    (fetchPostById as Mock).mockResolvedValue(post("draft"));
    (updateBlogPost as Mock).mockRejectedValueOnce(new Error("upstream 503"));
    (updateBlogPost as Mock).mockResolvedValue(post("published"));
    renderEditor();
    fireEvent.click(await screen.findByText("Опубликовать"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Не удалось опубликовать" })),
    );
    expect(screen.getByText("Черновик")).toBeInTheDocument();
    expect(triggerFrontendRebuild).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    fireEvent.click(screen.getByText("Опубликовать"));

    await waitFor(() => expect(updateBlogPost).toHaveBeenCalledTimes(2));
    expect(publishedAtOfCall(0)).toBe("2026-09-01T10:00:00.000Z");
    expect(publishedAtOfCall(1)).toBe("2026-09-02T10:00:00.000Z");
  });

  it("lets the address follow the title again after a failed first publish", async () => {
    (createBlogPost as Mock).mockRejectedValue(new Error("upstream 503"));
    renderEditor("/blog/admin/new");
    const title = await screen.findByPlaceholderText("Название");
    fireEvent.change(title, { target: { value: "Первая статья" } });
    fireEvent.click(screen.getByText("Опубликовать"));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Не удалось опубликовать" })),
    );
    fireEvent.change(title, { target: { value: "Вторая статья" } });

    expect(document.getElementById("blog-slug")).toHaveValue(slugifyTitle("Вторая статья"));
  });

  it("takes no second status action while the first write is in flight", async () => {
    (fetchPostById as Mock).mockResolvedValue(post("published"));
    let fail: (error: Error) => void = () => {};
    (updateBlogPost as Mock).mockReturnValue(new Promise((_, reject) => (fail = reject)));
    renderEditor();
    fireEvent.click(await screen.findByText("Снять с публикации"));

    const publishButton = await screen.findByRole("button", { name: "Опубликовать" });
    expect(publishButton).toBeDisabled();
    fireEvent.click(publishButton);
    fail(new Error("upstream 503"));

    expect(await screen.findByRole("button", { name: "Снять с публикации" })).toBeEnabled();
    expect(screen.getByText("Опубликовано")).toBeInTheDocument();
    expect(updateBlogPost).toHaveBeenCalledTimes(1);
  });
});
