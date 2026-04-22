import { Badge } from "@/components/ui/badge";
import { SHOW_ESTIMATE_VERSION_UI } from "@/lib/estimate-v2/show-estimate-version-ui";
import type { ApprovalStamp } from "@/types/estimate-v2";

interface ApprovalStampCardProps {
  stamp: ApprovalStamp;
  versionNumber: number;
  className?: string;
}

export function ApprovalStampCard({ stamp, versionNumber, className }: ApprovalStampCardProps) {
  const fullName = `${stamp.name} ${stamp.surname}`.trim();
  const approvedAt = new Date(stamp.timestamp).toLocaleString();

  return (
    <div className={`rounded-lg border border-success/30 bg-success/5 p-3 ${className ?? ""}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="bg-success/15 text-success">Approved</Badge>
        {SHOW_ESTIMATE_VERSION_UI ? (
          <span className="text-caption text-muted-foreground">Version #{versionNumber}</span>
        ) : null}
      </div>
      <p className="mt-2 text-body-sm font-medium text-foreground">{fullName}</p>
      <p className="text-caption text-muted-foreground">{approvedAt}</p>
    </div>
  );
}
