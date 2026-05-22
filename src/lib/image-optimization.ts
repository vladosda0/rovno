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

const TARGET_MAX_DIMENSION_PX = 3840;
const TARGET_JPEG_QUALITY = 0.9;
const TARGET_MAX_SIZE_MB = 4;
const SKIP_OPTIMIZE_BELOW_BYTES = 750 * 1024; // 750 KB

const HEIC_MIME_RE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_EXT_RE = /\.(heic|heif)$/i;

function isHeic(file: File): boolean {
  if (file.type && HEIC_MIME_RE.test(file.type)) return true;
  // iOS Safari sometimes leaves file.type empty for HEIC; sniff by extension.
  return !file.type && HEIC_EXT_RE.test(file.name);
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
  const { default: heic2any } = await import("heic2any");
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
  options?: { forceReencode?: boolean },
): Promise<ImageOptimizationResult> {
  if (!isImage(file)) {
    return { file, optimized: false };
  }

  let working = file;
  let didConvert = false;

  if (isHeic(file)) {
    working = await decodeHeicToJpegFile(file);
    didConvert = true;
  } else if (!options?.forceReencode && file.size <= SKIP_OPTIMIZE_BELOW_BYTES) {
    // Small natively-renderable images (screenshots, small JPEGs) don't need
    // re-encoding. Returning the original avoids unnecessary quality loss
    // for diagrams and PNG screenshots. Callers that publish images to a
    // public bucket pass forceReencode to strip EXIF/GPS even for small files.
    return { file, optimized: false };
  }

  const { default: imageCompression } = await import("browser-image-compression");
  const compressed = await imageCompression(working, {
    maxSizeMB: TARGET_MAX_SIZE_MB,
    maxWidthOrHeight: TARGET_MAX_DIMENSION_PX,
    initialQuality: TARGET_JPEG_QUALITY,
    fileType: "image/jpeg",
    useWebWorker: true,
    alwaysKeepResolution: false,
  });

  const out = new File([compressed], rewriteExtensionToJpg(working.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });

  return { file: out, optimized: didConvert || out.size !== file.size };
}
