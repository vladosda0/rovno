import { Link } from "react-router-dom";
import { Users, ArrowRight } from "lucide-react";
import { getUserById } from "@/data/store";
import type { Member } from "@/types/entities";

interface Props {
  members: Member[];
  projectId: string;
}

export function ParticipantsWidget({ members, projectId }: Props) {
  return (
    <div className="glass rounded-card p-sp-2">
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" /> Participants
        </h3>
        <Link to={`/project/${projectId}/participants`} className="text-caption text-accent hover:underline flex items-center gap-1">
          Manage <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-1.5">
        {members.map((m) => {
          const user = getUserById(m.user_id);
          return (
            <div key={m.user_id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-accent">{user?.name?.charAt(0) ?? "?"}</span>
              </div>
              <span className="text-caption text-foreground flex-1 truncate">{user?.name ?? "Unknown"}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{m.role}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
