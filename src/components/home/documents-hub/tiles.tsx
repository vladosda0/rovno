import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Folder, MoreHorizontal, Edit2, Trash2, Plus, Download, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string; strokeWidth?: number | string }>;

interface FolderTileProps {
  title: string;
  count: number;
  icon?: IconComponent;
  description?: string | null;
  coverUrl?: string | null;
  active?: boolean;
  onClick?: () => void;
  draggingOver?: boolean;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
  menu?: {
    onRename?: () => void;
    onDelete?: () => void;
    renameLabel: string;
    deleteLabel: string;
  } | null;
  filesLabel: string;
}

export function FolderTile({
  title,
  count,
  icon: Icon = Folder,
  description,
  coverUrl,
  active = false,
  onClick,
  draggingOver = false,
  onDragOver,
  onDragLeave,
  onDrop,
  menu,
  filesLabel,
}: FolderTileProps) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group relative flex h-full cursor-pointer flex-col overflow-hidden transition",
        "hover:border-accent/50 hover:shadow-md",
        active && "border-accent ring-1 ring-accent",
        draggingOver && "border-accent bg-accent/5 ring-2 ring-accent",
      )}
    >
      <div
        className="h-32 w-full bg-gradient-to-br from-accent/20 via-accent/8 to-transparent flex items-center justify-center"
        aria-hidden="true"
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-10 w-10 text-accent" strokeWidth={1.5} />
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-body font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {filesLabel.replace("{{count}}", String(count))}
            </p>
          </div>
          {menu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Folder menu"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {menu.onRename && (
                  <DropdownMenuItem onSelect={menu.onRename}>
                    <Edit2 className="h-3.5 w-3.5 mr-2" />
                    {menu.renameLabel}
                  </DropdownMenuItem>
                )}
                {menu.onDelete && (
                  <DropdownMenuItem onSelect={menu.onDelete} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    {menu.deleteLabel}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {description && (
          <p className="line-clamp-2 text-caption text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface CreateFolderTileProps {
  label: string;
  onClick: () => void;
}

export function CreateFolderTile({ label, onClick }: CreateFolderTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-card/40 p-4 text-muted-foreground transition",
        "hover:border-accent hover:bg-accent/5 hover:text-accent",
      )}
    >
      <Plus className="h-7 w-7" strokeWidth={1.5} />
      <span className="text-body font-medium">{label}</span>
    </button>
  );
}

interface FileTileProps {
  title: string;
  description?: string | null;
  icon?: IconComponent;
  iconColor?: string;
  /** ISO date string or pre-formatted "YYYY-MM-DD". Shown in the meta row. */
  dateAdded?: string | null;
  onClick?: () => void;
  onDownload?: () => void;
  onView?: () => void;
  downloadLabel: string;
  viewLabel: string;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  trailingMenu?: ReactNode;
}

export function FileTile({
  title,
  description,
  icon: Icon = FileText,
  iconColor = "text-accent",
  dateAdded,
  onClick,
  onDownload,
  onView,
  downloadLabel,
  viewLabel,
  draggable,
  onDragStart,
  trailingMenu,
}: FileTileProps) {
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden transition",
        "hover:border-accent/50 hover:shadow-md",
        onClick && "cursor-pointer",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-accent/20 via-accent/8 to-transparent" aria-hidden="true">
        <Icon className={cn("h-10 w-10", iconColor)} strokeWidth={1.5} />
      </div>
      <CardContent className="flex flex-1 flex-col gap-1 p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-body font-semibold text-foreground">{title}</h3>
        </div>
        {description && (
          <p className="line-clamp-2 text-caption text-muted-foreground">{description}</p>
        )}
        {dateAdded && (
          <p className="text-caption text-muted-foreground">{dateAdded}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <div className="flex gap-1">
            {onView && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onView();
                }}
                aria-label={viewLabel}
                title={viewLabel}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDownload && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                aria-label={downloadLabel}
                title={downloadLabel}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {trailingMenu && <div onClick={(e) => e.stopPropagation()}>{trailingMenu}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

interface TileGridProps {
  children: ReactNode;
}

export function TileGrid({ children }: TileGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}
