import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isImage, optimizeImageForUpload } from "@/lib/image-optimization";
import { uploadFileToBucket } from "@/data/org-source";

export const AVATARS_BUCKET = "avatars";

export interface AvatarUploadResult {
  /** Public URL to store in profiles/contractor_profiles.avatar_url and render. */
  url: string;
  /** Storage object path, for potential later deletion. */
  path: string;
}

/**
 * Uploads an avatar/logo to the public `avatars` bucket and returns its public URL.
 *
 * The image is re-encoded to JPEG before upload (forceReencode) so EXIF/GPS is
 * stripped — important because the bucket is world-readable. Objects live under
 * the uploader's own uid prefix (`{auth.uid()}/{uuid}.jpg`), matching the bucket
 * RLS. Display uses getPublicUrl (no signed URL), so it works for anonymous
 * viewers on public org pages.
 */
export function useAvatarUpload() {
  const uploadAvatar = useCallback(async (file: File): Promise<AvatarUploadResult> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) throw new Error("Not authenticated");

    // The avatars bucket is world-readable, so reject anything that wouldn't be
    // re-encoded (a renamed/empty-MIME file would otherwise upload with EXIF/GPS
    // intact). optimizeImageForUpload only strips metadata for real images.
    if (!isImage(file)) throw new Error("Selected file is not an image");

    const { file: optimized } = await optimizeImageForUpload(file, { forceReencode: true });

    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    await uploadFileToBucket(AVATARS_BUCKET, path, optimized, { upsert: true });

    const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }, []);

  return { uploadAvatar };
}
