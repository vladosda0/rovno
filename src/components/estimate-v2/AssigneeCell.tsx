import { useEffect, useMemo, useState } from "react";
import { Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AssigneeOption {
  id: string;
  name: string;
  email: string;
}

interface AssigneeValue {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
}

interface AssigneeCellProps extends AssigneeValue {
  participants: AssigneeOption[];
  editable: boolean;
  clientView?: boolean;
  onCommit: (next: AssigneeValue) => void;
}

const normalizeIdentityName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function AssigneeCell({
  assigneeId,
  assigneeName,
  assigneeEmail,
  participants,
  editable,
  clientView = false,
  onCommit,
}: AssigneeCellProps) {
  const [open, setOpen] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");

  const selectedParticipant = useMemo(
    () => (assigneeId ? participants.find((entry) => entry.id === assigneeId) ?? null : null),
    [assigneeId, participants],
  );

  const displayName = selectedParticipant?.name ?? assigneeName ?? assigneeEmail ?? "";

  useEffect(() => {
    if (!open) return;
    setSelectedParticipantId(assigneeId ?? "");
    if (assigneeId) {
      setCustomName("");
      setCustomEmail("");
      return;
    }
    setCustomName(assigneeName ?? "");
    setCustomEmail(assigneeEmail ?? "");
  }, [assigneeEmail, assigneeId, assigneeName, open]);

  if (clientView || !editable) {
    return <span className="text-xs text-muted-foreground">{displayName || "—"}</span>;
  }

  const canSave = Boolean(selectedParticipantId || customName.trim() || customEmail.trim());

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 max-w-full gap-1 px-2 text-xs",
          displayName ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => setOpen(true)}
      >
        <User className="h-3.5 w-3.5" />
        <span className="truncate">{displayName || "Assign"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign resource</DialogTitle>
            <DialogDescription>
              Assign by participant or identity. Assignment does not grant project access.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Participants</p>
              <div className="max-h-40 overflow-auto rounded-md border border-border/70 p-1">
                {participants.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No participants available.</p>
                ) : (
                  participants.map((participant) => {
                    const selected = selectedParticipantId === participant.id;
                    return (
                      <button
                        key={participant.id}
                        type="button"
                        className={cn(
                          "flex w-full items-start justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
                          selected && "bg-muted",
                        )}
                        onClick={() => {
                          setSelectedParticipantId(participant.id);
                          setCustomName("");
                          setCustomEmail("");
                        }}
                      >
                        <span className="text-sm text-foreground">{participant.name}</span>
                        <span className="text-xs text-muted-foreground">{participant.email}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border/70 p-2">
              <p className="text-xs font-medium text-muted-foreground">Identity (optional email for invite)</p>
              <Input
                value={customName}
                onChange={(event) => {
                  setSelectedParticipantId("");
                  setCustomName(event.target.value);
                }}
                className="h-8"
                placeholder="Name"
              />
              <p className="text-[11px] text-muted-foreground">
                Exact name matching links only when one participant has that name.
              </p>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={customEmail}
                  onChange={(event) => {
                    setSelectedParticipantId("");
                    setCustomEmail(event.target.value);
                  }}
                  className="h-8 pl-7"
                  placeholder="contractor@example.com"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onCommit({ assigneeId: null, assigneeName: null, assigneeEmail: null });
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={() => {
                  if (selectedParticipantId) {
                    const participant = participants.find((entry) => entry.id === selectedParticipantId) ?? null;
                    onCommit({
                      assigneeId: selectedParticipantId,
                      assigneeName: participant?.name ?? null,
                      assigneeEmail: participant?.email ?? null,
                    });
                    setOpen(false);
                    return;
                  }
                  const normalizedCustomName = normalizeIdentityName(customName);
                  const matchedParticipants =
                    !customEmail.trim() && normalizedCustomName
                      ? participants.filter((entry) => normalizeIdentityName(entry.name) === normalizedCustomName)
                      : [];
                  if (matchedParticipants.length === 1) {
                    const [matchedParticipant] = matchedParticipants;
                    onCommit({
                      assigneeId: matchedParticipant.id,
                      assigneeName: matchedParticipant.name,
                      assigneeEmail: matchedParticipant.email,
                    });
                    setOpen(false);
                    return;
                  }
                  onCommit({
                    assigneeId: null,
                    assigneeName: customName.trim() || null,
                    assigneeEmail: customEmail.trim() || null,
                  });
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
