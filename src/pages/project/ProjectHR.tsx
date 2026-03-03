import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { useHRItems, useHRPayments, usePermission, useProject } from "@/hooks/use-mock-data";
import { useToast } from "@/hooks/use-toast";
import {
  addPayment,
  relinkToEstimateLine,
  setStatus,
  updateFromEstimateLine,
} from "@/data/hr-store";
import type { HRItemStatus } from "@/types/hr";
import { Users } from "lucide-react";

function fmt(value: number): string {
  return value.toLocaleString("ru-RU") + " ₽";
}

const STATUS_OPTIONS: HRItemStatus[] = ["planned", "requested", "approved", "paid", "cancelled"];

function statusLabel(status: HRItemStatus): string {
  if (status === "requested") return "Requested";
  if (status === "approved") return "Approved";
  if (status === "paid") return "Paid";
  if (status === "cancelled") return "Cancelled";
  return "Planned";
}

export default function ProjectHR() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { toast } = useToast();

  const { project } = useProject(pid);
  const { lines } = useEstimateV2Project(pid);
  const hrItems = useHRItems(pid);
  const hrPayments = useHRPayments(pid);
  const { can } = usePermission(pid);
  const canEdit = can("procurement.edit");

  const [paymentDraftByItemId, setPaymentDraftByItemId] = useState<Record<string, string>>({});
  const [relinkDraftByItemId, setRelinkDraftByItemId] = useState<Record<string, string>>({});

  const hrLines = useMemo(
    () => lines.filter((line) => line.type === "labor" || line.type === "subcontractor"),
    [lines],
  );

  const paidByItemId = useMemo(() => {
    const map = new Map<string, number>();
    hrPayments.forEach((payment) => {
      map.set(payment.hrItemId, (map.get(payment.hrItemId) ?? 0) + payment.amount);
    });
    return map;
  }, [hrPayments]);

  if (!project) {
    return <EmptyState icon={Users} title="Not found" description="Project not found." />;
  }

  return (
    <div className="space-y-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Human Resources</h2>
          <Badge variant="secondary">{hrItems.length} items</Badge>
        </div>

        {hrItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No HR items"
            description="HR planned items will appear when Estimate v2 enters In work."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Relink</TableHead>
                  <TableHead>Add payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hrItems.map((item) => {
                  const paid = paidByItemId.get(item.id) ?? 0;
                  const planned = item.plannedQty * item.plannedRate;
                  const remaining = Math.max(planned - paid, 0);

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{item.title}</span>
                          {item.lockedFromEstimate && <Badge variant="outline">Locked</Badge>}
                          {item.orphaned && <Badge variant="destructive">Orphaned</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>
                        <Select
                          value={item.status}
                          onValueChange={(value) => setStatus(item.id, value as HRItemStatus)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="h-8 w-[130px]">
                            <SelectValue>{statusLabel(item.status)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>{statusLabel(option)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">{fmt(planned)}</TableCell>
                      <TableCell className="text-right">{fmt(paid)}</TableCell>
                      <TableCell className="text-right">{fmt(remaining)}</TableCell>
                      <TableCell>
                        {item.orphaned ? (
                          <div className="flex items-center gap-2">
                            <Select
                              value={relinkDraftByItemId[item.id] || undefined}
                              onValueChange={(value) => {
                                setRelinkDraftByItemId((prev) => ({ ...prev, [item.id]: value }));
                              }}
                            >
                              <SelectTrigger className="h-8 w-[180px]">
                                <SelectValue placeholder="Select line" />
                              </SelectTrigger>
                              <SelectContent>
                                {hrLines.map((line) => (
                                  <SelectItem key={line.id} value={line.id}>{line.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canEdit || !relinkDraftByItemId[item.id]}
                              onClick={() => {
                                const nextLineId = relinkDraftByItemId[item.id];
                                if (!nextLineId) return;
                                const nextLine = hrLines.find((line) => line.id === nextLineId);
                                if (!nextLine) return;
                                relinkToEstimateLine(item.id, nextLineId);
                                updateFromEstimateLine(pid, item.id, {
                                  stageId: nextLine.stageId,
                                  workId: nextLine.workId,
                                  title: nextLine.title,
                                  plannedQty: Math.max(0, nextLine.qtyMilli / 1_000),
                                  plannedRate: Math.max(0, nextLine.costUnitCents / 100),
                                  type: nextLine.type === "subcontractor" ? "subcontractor" : "labor",
                                  lineId: nextLine.id,
                                });
                                toast({ title: "HR item relinked" });
                              }}
                            >
                              Relink
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Linked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            className="h-8 w-[110px]"
                            placeholder="Amount"
                            value={paymentDraftByItemId[item.id] ?? ""}
                            onChange={(event) => {
                              setPaymentDraftByItemId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }));
                            }}
                            disabled={!canEdit}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canEdit || !paymentDraftByItemId[item.id]}
                            onClick={() => {
                              const amount = Number(paymentDraftByItemId[item.id] ?? 0);
                              if (!Number.isFinite(amount) || amount <= 0) return;
                              addPayment(item.id, amount, new Date().toISOString());
                              setPaymentDraftByItemId((prev) => ({ ...prev, [item.id]: "" }));
                              toast({ title: "Payment added" });
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
