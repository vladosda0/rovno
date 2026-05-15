import { useState, type ReactNode } from "react";
import { useMediaSignedUrl } from "@/hooks/use-media-signed-url";
import type { StorageObjectMeta } from "@/types/entities";

interface Props {
  storage: StorageObjectMeta | null | undefined;
  alt?: string;
  imgClassName?: string;
  fallback: ReactNode;
}

export function MediaImage({ storage, alt, imgClassName, fallback }: Props) {
  const { url } = useMediaSignedUrl(storage);
  const [errored, setErrored] = useState(false);

  const mimeType = storage?.mimeType ?? "";
  const isImage = mimeType ? mimeType.startsWith("image/") : Boolean(storage);

  if (!storage || !url || errored || !isImage) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={url}
      alt={alt ?? ""}
      className={imgClassName}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}
