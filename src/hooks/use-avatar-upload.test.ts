import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const getSessionMock = vi.fn();
const getPublicUrlMock = vi.fn();
const storageFromMock = vi.fn(() => ({ getPublicUrl: getPublicUrlMock }));
const optimizeMock = vi.fn();
const uploadMock = vi.fn();
const isImageMock = vi.fn(() => true);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => getSessionMock() },
    storage: { from: (b: string) => storageFromMock(b) },
  },
}));
vi.mock("@/lib/image-optimization", () => ({
  optimizeImageForUpload: (file: File, opts?: unknown) => optimizeMock(file, opts),
  isImage: (file: File) => isImageMock(file),
}));
vi.mock("@/data/org-source", () => ({
  uploadFileToBucket: (...args: unknown[]) => uploadMock(...args),
}));

import { useAvatarUpload } from "@/hooks/use-avatar-upload";

describe("useAvatarUpload", () => {
  beforeEach(() => {
    getSessionMock.mockReset().mockResolvedValue({ data: { session: { user: { id: "user-123" } } } });
    getPublicUrlMock.mockReset().mockReturnValue({ data: { publicUrl: "https://cdn/avatars/x.jpg" } });
    storageFromMock.mockClear();
    optimizeMock.mockReset();
    uploadMock.mockReset().mockResolvedValue(undefined);
    isImageMock.mockReset().mockReturnValue(true);
  });

  it("force-reencodes, uploads under the uid prefix with upsert, and returns the public URL", async () => {
    const optimized = new File(["x"], "out.jpg", { type: "image/jpeg" });
    optimizeMock.mockResolvedValue({ file: optimized, optimized: true });
    const input = new File(["raw"], "photo.heic");

    const { result } = renderHook(() => useAvatarUpload());
    const out = await result.current.uploadAvatar(input);

    expect(optimizeMock).toHaveBeenCalledWith(input, { forceReencode: true });
    expect(storageFromMock).toHaveBeenCalledWith("avatars");
    expect(uploadMock).toHaveBeenCalledWith(
      "avatars",
      expect.stringMatching(/^user-123\/[0-9a-f-]{36}\.jpg$/),
      optimized,
      { upsert: true },
    );
    expect(out).toEqual({ url: "https://cdn/avatars/x.jpg", path: expect.stringMatching(/^user-123\//) });
  });

  it("throws when not authenticated", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAvatarUpload());
    await expect(result.current.uploadAvatar(new File(["x"], "p.jpg"))).rejects.toThrow("Not authenticated");
  });

  it("rejects non-image files (privacy: avatars bucket is public)", async () => {
    isImageMock.mockReturnValue(false);
    const { result } = renderHook(() => useAvatarUpload());
    await expect(
      result.current.uploadAvatar(new File(["x"], "secret.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("not an image");
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
