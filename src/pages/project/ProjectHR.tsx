import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { getUserById } from "@/data/store";
import {
  addPayment,
  relinkToEstimateLine,
  setHRAssignees,
  setStatus,
  updateFromEstimateLine,
} from "@/data/hr-store";
import type { HRItemStatus, HRPlannedItem } from "@/types/hr";
import { Users } from "lucide-react";

function fmt(value: number): string {
  return value.toLocaleString("ru-RU") + " ₽";
}

type HRPaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

const STATUS_OPTIONS: HRItemStatus[] = ["planned", "in_progress", "blocked", "done", "cancelled"];
const PAYMENT_STATUS_OPTIONS: Array<"all" | HRPaymentStatus> = ["all", "unpaid", "partial", "paid", "overpaid"];
const PAYMENT_STATUS_ORDER: Record<HRPaymentStatus, number> = {
  unpaid: 0,
  partial: 1,
  paid: 2,
  overpaid: 3,
};

function statusLabel(status: HRItemStatus): string {
  if (status === "in_progress") return "In progress";
  if (status === "blocked") return "Blocked";
  if (status === "done") return "Done";
  if (status === "cancelled") return "Cancelled";
  return "Planned";
}

function paymentStatusFromTotals(planned: number, paid: number): HRPaymentStatus {
  const normalizedPlanned = Math.max(0, planned);
  const normalizedPaid = Math.max(0, paid);

  if (normalizedPaid <= 0) return "unpaid";
  if (normalizedPlanned <= 0) return "overpaid";
  if (normalizedPaid < normalizedPlanned) return "partial";
  if (normalizedPaid === normalizedPlanned) return "paid";
  return "overpaid";
}

function paymentStatusLabel(status: HRPaymentStatus): string {
  if (status === "partial") return "Partial";
  if (status === "paid") return "Paid";
  if (status === "overpaid") return "Overpaid";
  return "Unpaid";
}

function paymentStatusBadgeVariant(status: HRPaymentStatus): "destructive" | "outline" | "secondary" {
  if (status === "overpaid") return "destructive";
  if (status === "unpaid") return "outline";
  return "secondary";
}

function normalizeAssigneeIds(item: HRPlannedItem): string[] {
  if (Array.isArray(item.assigneeIds)) return item.assigneeIds;
  if (item.assignee) return [item.assignee];
  return [];
}

function assigneeSummary(assigneeIds: string[], namesById: Map<string, string>): string {
  const names = assigneeIds.map((id) => namesById.get(id) ?? id);
  if (names.length === 0) return "Unassigned";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

export default function ProjectHR() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { toast } = useToast();

  const { project, members } = useProject(pid);
  const { lines } = useEstimateV2Project(pid);
  const hrItems = useHRItems(pid);
  const hrPayments = useHRPayments(pid);
  const { can } = usePermission(pid);
  const canEdit = can("hr.edit");

  const [paymentDraftByItemId, setPaymentDraftByItemId] = useState<Record<string, string>>({});
  const [relinkDraftByItemId, setRelinkDraftByItemId] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [orphanedOnly, setOrphanedOnly] = useState(false);
  const [workStatusFilter, setWorkStatusFilter] = useState<"all" | HRItemStatus>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | HRPaymentStatus>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"any" | "unassigned" | string>("any");

  const participants = useMemo(
    () => members
      .map((member) => {
        const user = getUserById(member.user_id);
        if (!user) return null;
        return { id: member.user_id, name: user.name };
      })
      .filter((entry): entry is { id: string; name: string } => Boolean(entry)),
    [members],
  );

  const participantNameById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.name])),
    [participants],
  );

  const hrLines = useMemo(
    () => lines.filter((line) => line.type === "labor" || line.type === "subcontractor"),
    [lines],
  );

  const linkedHrItemIdByLineId = useMemo(() => {
    const map = new Map<string, string>();
    hrItems.forEach((item) => {
      if (!item.sourceEstimateV2LineId) return;
      map.set(item.sourceEstimateV2LineId, item.id);
    });
    return map;
  }, [hrItems]);

  const paidByItemId = useMemo(() => {
    const map = new Map<string, number>();
    hrPayments.forEach((payment) => {
      map.set(payment.hrItemId, (map.get(payment.hrItemId) ?? 0) + payment.amount);
    });
    return map;
  }, [hrPayments]);

  const rows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return hrItems
      .map((item) => {
        const paid = paidByItemId.get(item.id) ?? 0;
        const planned = item.plannedQty * item.plannedRate;
        const remaining = Math.max(planned - paid, 0);
        const paymentStatus = paymentStatusFromTotals(planned, paid);
        const assigneeIds = normalizeAssigneeIds(item);

        return {
          item,
          planned,
          paid,
          remaining,
          paymentStatus,
          assigneeIds,
        };
      })
      .filter(({ item, paymentStatus, assigneeIds }) => {
        if (normalizedQuery && !item.title.toLowerCase().includes(normalizedQuery)) return false;
        if (orphanedOnly && !item.orphaned) return false;
        if (workStatusFilter !== "all" && item.status !== workStatusFilter) return false;
        if (paymentStatusFilter !== "all" && paymentStatus !== paymentStatusFilter) return false;
        if (assigneeFilter === "unassigned" && assigneeIds.length > 0) return false;
        if (assigneeFilter !== "any" && assigneeFilter !== "unassigned" && !assigneeIds.includes(assigneeFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.item.orphaned !== b.item.orphaned) return a.item.orphaned ? -1 : 1;
        if (PAYMENT_STATUS_ORDER[a.paymentStatus] !== PAYMENT_STATUS_ORDER[b.paymentStatus]) {
          return PAYMENT_STATUS_ORDER[a.paymentStatus] - PAYMENT_STATUS_ORDER[b.paymentStatus];
        }
        return a.item.title.localeCompare(b.item.title, "ru-RU");
      });
  }, [assigneeFilter, hrItems, orphanedOnly, paidByItemId, paymentStatusFilter, searchQuery, workStatusFilter]);

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
          <>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <Input
                placeholder="Search title"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-8"
              />

              <Select
                value={workStatusFilter}
                onValueChange={(value) => setWorkStatusFilter(value as "all" | HRItemStatus)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Work status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All work statuses</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{statusLabel(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={paymentStatusFilter}
                onValueChange={(value) => setPaymentStatusFilter(value as "all" | HRPaymentStatus)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Payment status" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All payment statuses" : paymentStatusLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any assignee</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {participants.map((participant) => (
                    <SelectItem key={participant.id} value={participant.id}>{participant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="sm"
                variant={orphanedOnly ? "default" : "outline"}
                className="h-8"
                onClick={() => setOrphanedOnly((prev) => !prev)}
              >
                {orphanedOnly ? "Orphaned only" : "Show all linkage"}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assignees</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment status</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Relink</TableHead>
                    <TableHead>Add payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No HR items match current filters.
                      </TableCell>
                    </TableRow>
                  ) : rows.map(({ item, planned, paid, remaining, paymentStatus, assigneeIds }) => {
                    const canStartOrComplete = assigneeIds.length > 0;
                    const relinkOptions = hrLines.filter((line) => {
                      const linkedItemId = linkedHrItemIdByLineId.get(line.id);
                      return !linkedItemId || linkedItemId === item.id;
                    });

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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 max-w-[180px]"
                                disabled={!canEdit}
                              >
                                <span className="truncate">{assigneeSummary(assigneeIds, participantNameById)}</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-56">
                              {participants.length === 0 ? (
                                <DropdownMenuItem disabled>No participants available</DropdownMenuItem>
                              ) : participants.map((participant) => {
                                const checked = assigneeIds.includes(participant.id);
                                return (
                                  <DropdownMenuCheckboxItem
                                    key={participant.id}
                                    checked={checked}
                                    onSelect={(event) => event.preventDefault()}
                                    disabled={!canEdit}
                                    onCheckedChange={(nextChecked) => {
                                      if (!canEdit) return;
                                      const nextIds = nextChecked === true
                                        ? Array.from(new Set([...assigneeIds, participant.id]))
                                        : assigneeIds.filter((id) => id !== participant.id);
                                      const result = setHRAssignees(pid, item.id, nextIds);
                                      if (!result.ok) {
                                        toast({
                                          title: result.error ?? "Unable to update assignees",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  >
                                    {participant.name}
                                  </DropdownMenuCheckboxItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.status}
                            onValueChange={(value) => {
                              const result = setStatus(item.id, value as HRItemStatus);
                              if (!result.ok) {
                                toast({
                                  title: result.error ?? "Unable to update status",
                                  variant: "destructive",
                                });
                              }
                            }}
                            disabled={!canEdit}
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue>{statusLabel(item.status)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((option) => {
                                const requiresAssignee = option === "in_progress" || option === "done";
                                return (
                                  <SelectItem
                                    key={option}
                                    value={option}
                                    disabled={!canStartOrComplete && requiresAssignee}
                                  >
                                    {statusLabel(option)}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={paymentStatusBadgeVariant(paymentStatus)}>
                            {paymentStatusLabel(paymentStatus)}
                          </Badge>
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
                                disabled={!canEdit}
                              >
                                <SelectTrigger className="h-8 w-[180px]">
                                  <SelectValue placeholder="Select line" />
                                </SelectTrigger>
                                <SelectContent>
                                  {relinkOptions.map((line) => (
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

                                  const relinkResult = relinkToEstimateLine(item.id, nextLineId);
                                  if (!relinkResult.ok) {
                                    toast({
                                      title: relinkResult.error ?? "Unable to relink",
                                      variant: "destructive",
                                    });
                                    return;
                                  }

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
          </>
        )}
      </div>
    </div>
  );
}
