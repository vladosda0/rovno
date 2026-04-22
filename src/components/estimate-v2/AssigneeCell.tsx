import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

export interface PendingInviteOption {
  id: string;
  email: string;
}

interface AssigneeValue {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
}

interface AssigneeCellProps extends AssigneeValue {
  participants: AssigneeOption[];
  pendingInvites?: PendingInviteOption[];
  editable: boolean;
  clientView?: boolean;
  onCommit: (next: AssigneeValue) => void;
  onInvite?: (identity: { name: string; email: string }) => Promise<void> | void;
}

const isValidEmailFormat = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function AssigneeCell({
  assigneeId,
  assigneeName,
  assigneeEmail,
  participants,
  pendingInvites = [],
  editable,
  clientView = false,
  onCommit,
  onInvite,
}: AssigneeCellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const selectedParticipant = useMemo(
    () => (assigneeId ? participants.find((entry) => entry.id === assigneeId) ?? null : null),
    [assigneeId, participants],
  );

  const displayName = selectedParticipant?.name ?? assigneeName ?? assigneeEmail ?? "";
  const normalizedQuery = nameInput.trim().toLowerCase();

  const participantSuggestions = useMemo(() => {
    if (!normalizedQuery) return [];
    return participants.filter((participant) => {
      const name = participant.name.toLowerCase();
      const email = participant.email.toLowerCase();
      return name.includes(normalizedQuery) || email.includes(normalizedQuery);
    });
  }, [normalizedQuery, participants]);

  const pendingInviteSuggestions = useMemo(() => {
    if (!normalizedQuery) return [];
    const participantEmails = new Set(participants.map((participant) => participant.email.toLowerCase()));
    return pendingInvites.filter((invite) => {
      const email = invite.email.toLowerCase();
      return !participantEmails.has(email) && email.includes(normalizedQuery);
    });
  }, [normalizedQuery, participants, pendingInvites]);

  useEffect(() => {
    if (!open) return;
    setSelectedParticipantId(assigneeId ?? "");
    if (selectedParticipant) {
      setNameInput(selectedParticipant.name);
      setEmailInput(selectedParticipant.email);
    } else {
      setNameInput(assigneeName ?? "");
      setEmailInput(assigneeEmail ?? "");
    }
    setShowSuggestions(false);
  }, [assigneeEmail, assigneeId, assigneeName, open, selectedParticipant]);

  if (clientView || !editable) {
    return <span className="text-xs text-muted-foreground">{displayName || t("common.emptyDash")}</span>;
  }

  const trimmedName = nameInput.trim();
  const customEmailTrimmed = emailInput.trim();
  const hasCustomIdentityName = Boolean(trimmedName);
  const hasEmail = Boolean(customEmailTrimmed);
  const isEmailValid = !hasEmail || isValidEmailFormat(customEmailTrimmed);
  const shouldShowEmailSection = !selectedParticipantId;
  const isInviteEnabled = Boolean(
    onInvite && shouldShowEmailSection && hasCustomIdentityName && hasEmail && isValidEmailFormat(customEmailTrimmed),
  );
  const canSave = Boolean(selectedParticipantId || hasCustomIdentityName);
  const shouldShowSuggestions = showSuggestions
    && normalizedQuery.length > 0
    && (participantSuggestions.length > 0 || pendingInviteSuggestions.length > 0);

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
        <span className="truncate">{displayName || t("estimate.assignee.assignButton")}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("estimate.assignee.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("estimate.assignee.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2 rounded-md border border-border/70 p-2">
              <p className="text-xs font-medium text-muted-foreground">{t("estimate.assignee.nameLabel")}</p>
              <Input
                value={nameInput}
                onFocus={() => setShowSuggestions(true)}
                onChange={(event) => {
                  if (selectedParticipantId) {
                    setSelectedParticipantId("");
                    setNameInput("");
                    setEmailInput("");
                    setShowSuggestions(false);
                  } else {
                    setNameInput(event.target.value);
                    setShowSuggestions(true);
                  }
                }}
                className="h-8"
                placeholder={t("estimate.assignee.namePlaceholder")}
              />
              {shouldShowSuggestions && (
                <div className="max-h-44 overflow-auto rounded-md border border-border/70 p-1">
                  {participantSuggestions.map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
                        selectedParticipantId === participant.id && "bg-muted",
                      )}
                      onClick={() => {
                        setSelectedParticipantId(participant.id);
                        setNameInput(participant.name);
                        setEmailInput(participant.email);
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="text-sm text-foreground">{participant.name}</span>
                      <span className="text-xs text-muted-foreground">{participant.email}</span>
                    </button>
                  ))}
                  {pendingInviteSuggestions.map((invite) => (
                    <button
                      key={invite.id}
                      type="button"
                      className="flex w-full items-start justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                      onClick={() => {
                        setSelectedParticipantId("");
                        setEmailInput(invite.email);
                        if (!nameInput.trim()) {
                          setNameInput(invite.email.split("@")[0] ?? "");
                        }
                        setShowSuggestions(false);
                      }}
                    >
                      <span className="text-sm text-foreground">{invite.email}</span>
                      <span className="text-xs text-muted-foreground">{t("estimate.assignee.pendingInvite")}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedParticipantId && (
                <p className="text-[11px] text-muted-foreground">
                  {t("estimate.assignee.participantSelectedHint")}
                </p>
              )}
            </div>

            {shouldShowEmailSection && (
              <div className="space-y-2 rounded-md border border-border/70 p-2">
                <p className="text-xs font-medium text-muted-foreground">{t("estimate.assignee.emailLabel")}</p>
                <div className="flex items-start gap-2">
                  <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={emailInput}
                      onChange={(event) => {
                        setEmailInput(event.target.value);
                        if (selectedParticipantId) {
                          setSelectedParticipantId("");
                        }
                      }}
                      className={cn("h-8 pl-7", hasEmail && !isEmailValid && "border-destructive focus-visible:ring-destructive")}
                      placeholder={t("estimate.assignee.emailPlaceholder")}
                    />
                  </div>
                  {onInvite && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!isInviteEnabled || isInviting}
                      onClick={async () => {
                        if (!onInvite || !isInviteEnabled || isInviting) return;
                        setIsInviting(true);
                        try {
                          await onInvite({
                            name: trimmedName,
                            email: customEmailTrimmed.toLowerCase(),
                          });
                        } finally {
                          setIsInviting(false);
                        }
                      }}
                    >
                      {t("estimate.assignee.inviteButton")}
                    </Button>
                  )}
                </div>
                {hasEmail && !isEmailValid && (
                  <p className="text-[11px] text-destructive">{t("estimate.assignee.invalidEmail")}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {t("estimate.assignee.inviteOptionalHint")}
                </p>
              </div>
            )}
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
              {t("estimate.assignee.clear")}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
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
                  onCommit({
                    assigneeId: null,
                    assigneeName: trimmedName || null,
                    assigneeEmail: customEmailTrimmed || null,
                  });
                  setOpen(false);
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
