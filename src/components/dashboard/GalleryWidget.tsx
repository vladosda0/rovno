import { Link } from "react-router-dom";
import { Image, ArrowRight, Camera } from "lucide-react";
import type { Media } from "@/types/entities";

interface Props {
  media: Media[];
  projectId: string;
}

export function GalleryWidget({ media, projectId }: Props) {
  return (
    <div className="glass rounded-card p-sp-2">
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <Image className="h-4 w-4 text-accent" /> Gallery
        </h3>
        <Link to={`/project/${projectId}/gallery`} className="text-caption text-accent hover:underline flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {media.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {media.slice(0, 6).map((m) => (
            <div key={m.id} className="rounded-panel bg-muted/40 aspect-square flex flex-col items-center justify-center p-1">
              <Camera className="h-5 w-5 text-muted-foreground mb-0.5" />
              <p className="text-[10px] text-muted-foreground text-center line-clamp-2">{m.caption}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground text-center py-sp-2">No photos yet</p>
      )}
    </div>
  );
}
