import { beforeEach, describe, expect, it, vi } from "vitest";

const compressMock = vi.fn();

vi.mock("browser-image-compression", () => ({
  default: (file: File, options: unknown) => compressMock(file, options),
}));

import { optimizeImageForUpload } from "@/lib/image-optimization";

describe("optimizeImageForUpload", () => {
  beforeEach(() => {
    compressMock.mockReset().mockImplementation(async () => new Blob(["small"], { type: "image/jpeg" }));
  });

  it("keeps the 3840 px edge by default", async () => {
    await optimizeImageForUpload(new File(["x"], "photo.jpg", { type: "image/jpeg" }), { forceReencode: true });
    expect(compressMock).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxWidthOrHeight: 3840 }));
  });

  it("downscales to the requested longest edge", async () => {
    const out = await optimizeImageForUpload(new File(["x"], "photo.png", { type: "image/png" }), {
      forceReencode: true,
      maxDimension: 2048,
    });
    expect(compressMock).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ maxWidthOrHeight: 2048 }));
    expect(out.file.name).toBe("photo.jpg");
    expect(out.file.type).toBe("image/jpeg");
  });
});
