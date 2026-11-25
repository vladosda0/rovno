import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Cropper from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { CropArea } from "@/lib/image-file";

/** Lets a person choose what part of a picture goes into a square logo or a 16:9 cover. */
export function ImageCropDialog({
  file,
  aspect,
  title,
  onCancel,
  onDone,
}: {
  file: File | null;
  aspect: number;
  title: string;
  onCancel: () => void;
  onDone: (file: File, area: CropArea) => void;
}) {
  const { t } = useTranslation();
  // The picture travels with its file, so a closing dialog keeps the last one.
  const [picture, setPicture] = useState<{ file: File; url: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);

  useEffect(() => {
    if (!file) {
      setArea(null);
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      setPicture(null);
      return;
    }
    setPicture({ file, url });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Dialog open={file !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="flex max-w-[520px] flex-col gap-0 p-0 max-sm:h-full max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader className="px-5 pb-2.5 pt-4 text-left">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative h-[300px] bg-[#0E0D06] max-sm:flex-1">
          {picture && (file === null || picture.file === file) ? (
            <Cropper
              image={picture.url}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
              objectFit="contain"
            />
          ) : null}
        </div>
        <div className="flex items-center gap-3 px-5 pb-1 pt-4 text-muted-foreground">
          <span aria-hidden="true">−</span>
          <Slider
            min={1}
            max={3}
            step={0.01}
            value={[zoom]}
            onValueChange={([value]) => setZoom(value)}
            aria-label={t("upload.modal.step3.visitka.appearance.cropZoom")}
            className="flex-1"
          />
          <span aria-hidden="true">+</span>
        </div>
        <DialogDescription className="px-5 pb-1.5 text-caption text-muted-foreground">
          {t("upload.modal.step3.visitka.appearance.cropHint")}
        </DialogDescription>
        <DialogFooter className="gap-2 px-5 pb-5 pt-3">
          <Button type="button" variant="outline" onClick={onCancel} className="max-sm:hidden">
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={!file || !area}
            onClick={() => file && area && onDone(file, area)}
          >
            {t("upload.modal.step3.visitka.appearance.cropDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
