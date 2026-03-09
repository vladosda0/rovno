import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Image, Upload, Camera, Star, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PhotoViewer } from "@/components/PhotoViewer";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useMedia, useTasks } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { addMedia, addEvent } from "@/data/store";
import type { Media as MediaType } from "@/types/entities";

export default function ProjectGallery() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const photos = useMedia(pid);
  const tasks = useTasks(pid);
  const perm = usePermission(pid);
  const user = useCurrentUser();

  const [filter, setFilter] = useState<"all" | "final" | "progress">("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [viewPhoto, setViewPhoto] = useState<MediaType | null>(null);

  const filtered = photos.filter((p) => {
    if (filter === "final") return p.is_final;
    if (filter === "progress") return !p.is_final;
    return true;
  });

  /* --- Upload --- */
  function handleUpload() {
    const mediaId = `media-${Date.now()}`;
    addMedia({
      id: mediaId,
      project_id: pid,
      task_id: uploadTaskId || undefined,
      uploader_id: user.id,
      caption: uploadCaption || "Photo",
      is_final: false,
      created_at: new Date().toISOString(),
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "photo_uploaded",
      object_type: "media",
      object_id: mediaId,
      timestamp: new Date().toISOString(),
      payload: { caption: uploadCaption },
    });
    setUploadOpen(false);
    setUploadCaption("");
    setUploadTaskId("");
    toast({ title: "Photo uploaded" });
  }

  /* placeholder colors for mock thumbnails */
  const placeholderColors = [
    "bg-accent/10", "bg-info/10", "bg-warning/10", "bg-muted",
    "bg-success/10", "bg-destructive/10",
  ];

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Image}
        title="No photos yet"
        description="Upload project photos to document progress."
        actionLabel="Upload Photos"
        onAction={() => setUploadOpen(true)}
      />
    );
  }

  return (
    <div className="space-y-sp-2">
      {/* Header */}
      <div className="glass-elevated rounded-card p-sp-2 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-h3 text-foreground">Gallery</h2>
          <p className="text-caption text-muted-foreground">
            {photos.length} photos · {photos.filter((p) => p.is_final).length} final
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Upload className="h-4 w-4 mr-1.5" /> Upload
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5">
        {(["all", "progress", "final"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-pill px-3 py-1 text-caption font-medium transition-colors border ${
              filter === f
                ? "bg-accent/10 text-accent border-accent/20"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {f === "all" ? "All" : f === "final" ? "Final photos" : "In progress"}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="glass rounded-card p-sp-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filtered.map((photo, idx) => {
            const task = tasks.find((t) => t.id === photo.task_id);
            return (
              <button
                key={photo.id}
                onClick={() => setViewPhoto(photo)}
                className="group relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-accent/40 transition-all"
              >
                <div className={`absolute inset-0 ${placeholderColors[idx % placeholderColors.length]} flex items-center justify-center`}>
                  <Camera className="h-8 w-8 text-muted-foreground/30" />
                </div>
                {/* Overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-caption text-foreground truncate">{photo.caption}</p>
                  {task && <p className="text-[10px] text-muted-foreground truncate">{task.title}</p>}
                </div>
                {photo.is_final && (
                  <div className="absolute top-1.5 right-1.5 bg-accent rounded-full p-0.5">
                    <Star className="h-3 w-3 text-accent-foreground" fill="currentColor" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Photo Viewer */}
      <PhotoViewer
        photo={viewPhoto}
        open={!!viewPhoto}
        onOpenChange={(o) => !o && setViewPhoto(null)}
        source="gallery"
        allPhotos={photos}
      />

      {/* Upload modal */}
      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent className="bg-card border border-border shadow-xl rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload photos</AlertDialogTitle>
            <AlertDialogDescription>Add project photos with an optional caption.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Camera className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-caption text-muted-foreground">Drag photos here or click to browse</p>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Caption (optional)</label>
              <Input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="e.g. Kitchen wiring complete" />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Link to task (optional)</label>
              <select
                value={uploadTaskId}
                onChange={(e) => setUploadTaskId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpload} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Upload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
