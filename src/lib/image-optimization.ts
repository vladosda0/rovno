/**
 * Image optimization pipeline for gallery uploads.
 *
 * Goals:
 * - Decode HEIC/HEIF so browsers can render the photo (no major browser
 *   except Safari renders HEIC natively).
 * - Downscale very large photos so we don't store 8-12 MB phone originals
 *   when 1-2 MB is enough for in-browser viewing.
 * - Re-encode to JPEG at quality 90 (visually lossless for photos) so the
 *   download has a `.jpg` extension users expect.
 *
 * Quality / size tuning: target longest edge is 3840 px and quality is 0.9.
 * This preserves enough detail for zoom-in inspection of construction work
 * and future AI vision review while still trimming a typical 8 MB iPhone
 * HEIC to ~1.5 MB.
 *
 * `heic2any` is dynamically imported only when a HEIC/HEIF file is picked,
 * so non-HEIC uploads don't pay the ~600 KB libheif WASM cost.
 */

import { importOptional } from "@/lib/observability/optional-import";

const TARGET_MAX_DIMENSION_PX = 3840;
const TARGET_JPEG_QUALITY = 0.9;
const TARGET_MAX_SIZE_MB = 4;
const SKIP_OPTIMIZE_BELOW_BYTES = 750 * 1024; // 750 KB

const HEIC_MIME_RE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "heim", "heis"]);
// Generic HEIF files (major brand mif1/msf1) are HEIC only when a HEVC brand is
// compatible; AVIF files can carry the same generic brands.
const AVIF_BRANDS = new Set(["avif", "avis"]);

function readHeader(file: File, length: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

async function hasHeicSignature(file: File): Promise<boolean> {
  let header: Uint8Array;
  try {
    header = await readHeader(file, 64);
  } catch {
    return false;
  }
  if (header.length < 12) return false;
  const text = String.fromCharCode(...header);
  if (text.slice(4, 8) !== "ftyp") return false;
  const major = text.slice(8, 12);
  if (HEIC_BRANDS.has(major)) return true;
  const boxEnd = Math.min(header.length, (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3]);
  const compatible: string[] = [];
  for (let i = 16; i + 4 <= boxEnd; i += 4) compatible.push(text.slice(i, i + 4));
  return compatible.some((b) => HEIC_BRANDS.has(b)) && !compatible.some((b) => AVIF_BRANDS.has(b));
}

async function isHeic(file: File): Promise<boolean> {
  if (file.type && HEIC_MIME_RE.test(file.type)) return true;
  // iOS Safari sometimes leaves file.type empty for HEIC; sniff by extension.
  if (!file.type && HEIC_EXT_RE.test(file.name)) return true;
  // Some pickers hand over HEIC bytes typed and named as PNG or JPEG.
  return hasHeicSignature(file);
}

export function isImage(file: File): boolean {
  if (file.type) return file.type.startsWith("image/");
  return /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(file.name);
}

function rewriteExtensionToJpg(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return `${filename}.jpg`;
  return `${filename.slice(0, idx)}.jpg`;
}

async function decodeHeicToJpegFile(file: File): Promise<File> {
  const { default: heic2any } = await importOptional(() => import("heic2any"));
  const blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: TARGET_JPEG_QUALITY,
  });
  const out = Array.isArray(blob) ? blob[0] : blob;
  return new File([out], rewriteExtensionToJpg(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export interface ImageOptimizationResult {
  file: File;
  /** True when the bytes were actually re-encoded (HEIC decode or compression). */
  optimized: boolean;
}

/**
 * Convert HEIC/HEIF to JPEG, downscale large photos, and re-encode to
 * JPEG q90. Non-image files pass through untouched.
 */
export async function optimizeImageForUpload(
  file: File,
  options?: { forceReencode?: boolean; maxDimension?: number },
): Promise<ImageOptimizationResult> {
  const heic = await isHeic(file);
  if (!heic && !isImage(file)) {
    return { file, optimized: false };
  }

  let working = file;
  let didConvert = false;

  if (heic) {
    working = await decodeHeicToJpegFile(file);
    didConvert = true;
  } else if (!options?.forceReencode && file.size <= SKIP_OPTIMIZE_BELOW_BYTES) {
    // Small natively-renderable images (screenshots, small JPEGs) don't need
    // re-encoding. Returning the original avoids unnecessary quality loss
    // for diagrams and PNG screenshots. Callers that publish images to a
    // public bucket pass forceReencode to strip EXIF/GPS even for small files.
    return { file, optimized: false };
  }

  const { default: imageCompression } = await importOptional(
    () => import("browser-image-compression"),
  );
  let compressed: Blob;
  try {
    compressed = await imageCompression(working, {
      maxSizeMB: TARGET_MAX_SIZE_MB,
      maxWidthOrHeight: options?.maxDimension ?? TARGET_MAX_DIMENSION_PX,
      initialQuality: TARGET_JPEG_QUALITY,
      fileType: "image/jpeg",
      useWebWorker: true,
      alwaysKeepResolution: false,
    });
  } catch (error) {
    // The decoded JPEG is still renderable; keep it rather than lose the photo.
    if (didConvert) return { file: working, optimized: true };
    throw error;
  }

  const out = new File([compressed], rewriteExtensionToJpg(working.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return { file: out, optimized: didConvert || out.size !== file.size };
}

/**
 * Photo upload paths that store the file as-is (task attachments, quick
 * actions) call this before preparing the upload. Only HEIC is converted to
 * JPEG; every other file is returned untouched. A HEIC that cannot be decoded
 * is refused with `decodeFailedMessage`, since storing it raw shows a
 * placeholder in Chrome.
 */
export async function prepareMediaPhotoForUpload(file: File, decodeFailedMessage: string): Promise<File> {
  if (!(await isHeic(file))) return file;
  try {
    return (await optimizeImageForUpload(file)).file;
  } catch {
    throw new Error(decodeFailedMessage);
  }
}
