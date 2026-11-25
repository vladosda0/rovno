import { beforeEach, describe, expect, it, vi } from "vitest";

const compressMock = vi.fn();
const heicMock = vi.fn();

vi.mock("browser-image-compression", () => ({
  default: (file: File, options: unknown) => compressMock(file, options),
}));

vi.mock("heic2any", () => ({
  default: (options: unknown) => heicMock(options),
}));

import { optimizeImageForUpload, prepareMediaPhotoForUpload } from "@/lib/image-optimization";

function heicBytesNamed(name: string, type: string, brand = "heic", compatible = ""): File {
  const size = 16 + compatible.length;
  const header = new Uint8Array([0, 0, 0, size, ...new TextEncoder().encode(`ftyp${brand}\0\0\0\0${compatible}`)]);
  return new File([header, "rest-of-heic"], name, { type });
}

beforeEach(() => {
  compressMock.mockReset().mockImplementation(async () => new Blob(["small"], { type: "image/jpeg" }));
  heicMock.mockReset().mockImplementation(async () => new Blob(["decoded"], { type: "image/jpeg" }));
});

describe("optimizeImageForUpload", () => {
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

describe("HEIC detection by file signature", () => {
  it("decodes HEIC bytes that arrive named and typed as PNG", async () => {
    const out = await optimizeImageForUpload(heicBytesNamed("img_3641.png", "image/png"));
    expect(heicMock).toHaveBeenCalledTimes(1);
    expect(out.file.name).toBe("img_3641.jpg");
    expect(out.file.type).toBe("image/jpeg");
  });

  it.each(["heix", "hevc", "heim", "heis"])("treats the %s brand as HEIC", async (brand) => {
    await optimizeImageForUpload(heicBytesNamed("photo.jpg", "image/jpeg", brand));
    expect(heicMock).toHaveBeenCalledTimes(1);
  });

  it("treats a generic mif1 file as HEIC only when a HEVC brand is compatible and AVIF is not", async () => {
    await optimizeImageForUpload(heicBytesNamed("a.png", "image/png", "mif1", "mif1avifmiaf"));
    await optimizeImageForUpload(heicBytesNamed("b.png", "image/png", "msf1", "msf1heicavis"));
    await optimizeImageForUpload(heicBytesNamed("d.png", "image/png", "mif1", "mif1miaf"));
    expect(heicMock).not.toHaveBeenCalled();
    await optimizeImageForUpload(heicBytesNamed("c.png", "image/png", "mif1", "mif1heic"));
    expect(heicMock).toHaveBeenCalledTimes(1);
  });

  it("decodes a HEIC with no type and no extension", async () => {
    const out = await optimizeImageForUpload(heicBytesNamed("IMG_0001", ""));
    expect(heicMock).toHaveBeenCalledTimes(1);
    expect(out.file.type).toBe("image/jpeg");
  });

  it("keeps the decoded JPEG when compression fails after a HEIC decode", async () => {
    compressMock.mockRejectedValue(new Error("canvas"));
    const out = await optimizeImageForUpload(heicBytesNamed("img.png", "image/png"));
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.name).toBe("img.jpg");
  });

  it("leaves a small real PNG untouched", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0])], "s.png", { type: "image/png" });
    expect((await optimizeImageForUpload(png)).file).toBe(png);
    expect(heicMock).not.toHaveBeenCalled();
  });

  it("needs the ftyp box, not just a brand name, to call it HEIC", async () => {
    const notHeic = new File([new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("abcdheic"), 0, 0, 0, 0])], "x.png", {
      type: "image/png",
    });
    await optimizeImageForUpload(notHeic);
    expect(heicMock).not.toHaveBeenCalled();
  });
});

describe("prepareMediaPhotoForUpload", () => {
  it("returns a JPEG for HEIC bytes", async () => {
    const out = await prepareMediaPhotoForUpload(heicBytesNamed("img.png", "image/png"), "upload failed");
    expect(out.name).toBe("img.jpg");
    expect(out.type).toBe("image/jpeg");
  });

  it("refuses to upload HEIC it could not decode", async () => {
    heicMock.mockRejectedValue(new Error("ERR_LIBHEIF format not supported"));
    await expect(prepareMediaPhotoForUpload(heicBytesNamed("img.png", "image/png"), "upload failed")).rejects.toThrow(
      "upload failed",
    );
  });

  it("does not re-encode a large non-HEIC photo", async () => {
    const big = new File([new Uint8Array(800 * 1024)], "big.jpg", { type: "image/jpeg" });
    await expect(prepareMediaPhotoForUpload(big, "upload failed")).resolves.toBe(big);
    expect(compressMock).not.toHaveBeenCalled();
  });

  it("uploads the original when the file header cannot be read", async () => {
    const unreadable = new File(["x"], "img.png", { type: "image/png" });
    const spy = vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementation(function (this: FileReader) {
      setTimeout(() => this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>));
    });
    await expect(prepareMediaPhotoForUpload(unreadable, "upload failed")).resolves.toBe(unreadable);
    spy.mockRestore();
  });

  it("passes a video through unchanged", async () => {
    const video = new File(["v"], "clip.mp4", { type: "video/mp4" });
    await expect(prepareMediaPhotoForUpload(video, "upload failed")).resolves.toBe(video);
  });
});
