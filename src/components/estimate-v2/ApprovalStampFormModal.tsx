import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApprovalStamp } from "@/types/estimate-v2";

interface ApprovalStampFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (stamp: ApprovalStamp) => void;
  title?: string;
  submitLabel?: string;
  defaults?: {
    name?: string;
    surname?: string;
    email?: string;
  };
}

export function ApprovalStampFormModal({
  open,
  onOpenChange,
  onSubmit,
  title = "Approval stamp",
  submitLabel = "Approve",
  defaults,
}: ApprovalStampFormModalProps) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [surname, setSurname] = useState(defaults?.surname ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");

  useEffect(() => {
    if (!open) return;
    setName(defaults?.name ?? "");
    setSurname(defaults?.surname ?? "");
    setEmail(defaults?.email ?? "");
  }, [defaults?.email, defaults?.name, defaults?.surname, open]);

  const canSubmit = Boolean(name.trim() && surname.trim() && email.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter approver details to generate an approval stamp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <Input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Surname" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({
                name: name.trim(),
                surname: surname.trim(),
                email: email.trim(),
                timestamp: new Date().toISOString(),
              });
            }}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
