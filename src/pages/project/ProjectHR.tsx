import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import { EmptyState } from "@/components/EmptyState";
import { ProjectWorkflowEmptyState } from "@/components/ProjectWorkflowEmptyState";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { useProjectHRMutations } from "@/hooks/use-hr-source";
import { useHRItems, useHRPayments, usePermission, useProject, useTasks } from "@/hooks/use-mock-data";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { useToast } from "@/hooks/use-toast";
import { getUserById } from "@/data/store";
import { isDemoSessionActive } from "@/lib/auth-state";
import type { TaskStatus } from "@/types/entities";
import type { HRItemStatus, HRPlannedItem } from "@/types/hr";
import { Users } from "lucide-react";

const EMPTY_SYNC_STATE = {
  estimateRevision: null,
  domains: {
    tasks: { status: "idle", projectedRevision: null, lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
    procurement: { status: "idle", projectedRevision: null, lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
    hr: { status: "idle", projectedRevision: null, lastAttemptedAt: null, lastSucceededAt: null, lastError: null },
  },
} as const;

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
  const names = assigneeIds.map((id) => namesById.get(id)).filter((name): name is string => Boolean(name));
  if (names.length === 0) return "Unassigned";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function taskStatusToWorkStatus(
  status: TaskStatus,
): Exclude<HRItemStatus, "cancelled"> {
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "planned";
}

export default function ProjectHR() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { toast } = useToast();
  const navigate = useNavigate();

  const { project, members } = useProject(pid);
  const estimateState = useEstimateV2Project(pid);
  const estimateSync = estimateState.sync ?? EMPTY_SYNC_STATE;
  const { lines } = estimateState;
  const tasks = useTasks(pid);
  const hrItems = useHRItems(pid);
  const hrPayments = useHRPayments(pid);
  const hrMutations = useProjectHRMutations(pid);
  const { can } = usePermission(pid);
  const workspaceMode = useWorkspaceMode();
  const canEdit = can("hr.edit");
  const isDemoMode = isDemoSessionActive();
  const isSupabaseMode = workspaceMode.kind === "supabase";
  const hrSyncState = estimateSync.domains.hr;
  const isHRSyncing = isSupabaseMode && hrSyncState.status === "syncing";
  const hasHRSyncError = isSupabaseMode && hrSyncState.status === "error";
  const isHRProjectionBehind = isSupabaseMode
    && estimateState.project.estimateStatus !== "planning"
    && hrSyncState.projectedRevision !== estimateSync.estimateRevision
    && !isHRSyncing
    && !hasHRSyncError;
  const shouldBlockHRLaunchActions = isHRProjectionBehind || hasHRSyncError;

  const [paymentDraftByItemId, setPaymentDraftByItemId] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
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

  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const lineById = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines],
  );

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
        const task = item.taskId ? taskById.get(item.taskId) ?? null : null;
        const linkedLineId = item.sourceEstimateV2LineId
          ?? (task
            ? task.checklist
              .filter((checklistItem) => Boolean(checklistItem.estimateV2LineId))
              .filter((checklistItem) => checklistItem.text === item.title)
              .map((checklistItem) => checklistItem.estimateV2LineId)
              .find((lineId): lineId is string => Boolean(lineId))
            : null)
          ?? null;
        const linkedLine = linkedLineId ? lineById.get(linkedLineId) ?? null : null;
        const paid = paidByItemId.get(item.id) ?? 0;
        const planned = linkedLine
          ? Math.max(0, linkedLine.qtyMilli / 1_000) * Math.max(0, linkedLine.costUnitCents / 100)
          : item.plannedQty * item.plannedRate;
        const remaining = Math.max(planned - paid, 0);
        const paymentStatus = paymentStatusFromTotals(planned, paid);
        const allAssigneeIds = normalizeAssigneeIds(item);
        const knownAssigneeIds = allAssigneeIds.filter((assigneeId) => participantNameById.has(assigneeId));
        const hiddenAssigneeIds = allAssigneeIds.filter((assigneeId) => !participantNameById.has(assigneeId));
        const estimateAssigneeLabel = linkedLine?.assigneeName?.trim()
          || linkedLine?.assigneeEmail?.trim()
          || null;
        const visibleAssigneeSummary = knownAssigneeIds.length > 0
          ? assigneeSummary(knownAssigneeIds, participantNameById)
          : (!isDemoMode && estimateAssigneeLabel ? estimateAssigneeLabel : "Unassigned");
        const hasVisibleAssignee = knownAssigneeIds.length > 0 || (!isDemoMode && Boolean(estimateAssigneeLabel));
        const workStatus = task ? taskStatusToWorkStatus(task.status) : item.status;
        const title = linkedLine?.title ?? item.title;
        const type = linkedLine?.type === "subcontractor" ? "subcontractor" : item.type;

        return {
          item,
          task,
          title,
          type,
          workStatus,
          planned,
          paid,
          remaining,
          paymentStatus,
          assigneeIds: knownAssigneeIds,
          hiddenAssigneeIds,
          visibleAssigneeSummary,
          hasVisibleAssignee,
        };
      })
      .filter(({ title, paymentStatus, workStatus, assigneeIds, hasVisibleAssignee }) => {
        if (normalizedQuery && !title.toLowerCase().includes(normalizedQuery)) return false;
        if (workStatusFilter !== "all" && workStatus !== workStatusFilter) return false;
        if (paymentStatusFilter !== "all" && paymentStatus !== paymentStatusFilter) return false;
        if (assigneeFilter === "unassigned" && hasVisibleAssignee) return false;
        if (assigneeFilter !== "any" && assigneeFilter !== "unassigned" && !assigneeIds.includes(assigneeFilter)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.item.orphaned !== b.item.orphaned) return a.item.orphaned ? -1 : 1;
        if (PAYMENT_STATUS_ORDER[a.paymentStatus] !== PAYMENT_STATUS_ORDER[b.paymentStatus]) {
          return PAYMENT_STATUS_ORDER[a.paymentStatus] - PAYMENT_STATUS_ORDER[b.paymentStatus];
        }
        return a.title.localeCompare(b.title, "ru-RU");
      });
  }, [assigneeFilter, hrItems, isDemoMode, lineById, paidByItemId, paymentStatusFilter, participantNameById, searchQuery, taskById, workStatusFilter]);

  if (!project) {
    return <EmptyState icon={Users} title="Not found" description="Project not found." />;
  }

  if (estimateState.project.estimateStatus === "planning") {
    return (
      <ProjectWorkflowEmptyState
        variant="hr"
        title="HR will be ready after planning"
        description="You are in a great place to start. HR items will appear here once your Estimate is moved to In work."
        actionLabel="Open Estimate"
        onAction={() => navigate(`/project/${pid}/estimate`)}
      />
    );
  }

  return (
    <div className="space-y-sp-2">
      {(isHRSyncing || isHRProjectionBehind || hasHRSyncError) && (
        <div className={`rounded-card border px-3 py-2 text-sm flex items-start gap-2 ${
          hasHRSyncError
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : isHRProjectionBehind
              ? "border-warning/30 bg-warning/10 text-foreground"
              : "border-info/30 bg-info/10 text-foreground"
        }`}>
          <Users className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {isHRSyncing
                ? "HR is syncing from Estimate"
                : hasHRSyncError
                  ? "HR sync failed"
                  : "HR is behind the latest Estimate"}
            </p>
            <p className="text-xs opacity-80">
              {isHRSyncing
                ? "Estimate-linked HR demand is being refreshed now."
                : hasHRSyncError
                  ? (hrSyncState.lastError ?? "Resolve the sync error before assigning people or adding payments.")
                  : "Wait for the HR projection to catch up before assigning people or adding payments."}
            </p>
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
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
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Assignees</TableHead>
                    <TableHead>Work Status</TableHead>
                    <TableHead>Payment status</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Add payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No HR items match current filters.
                      </TableCell>
                    </TableRow>
                  ) : rows.map(({ item, task, title, type, workStatus, planned, paid, remaining, paymentStatus, assigneeIds, hiddenAssigneeIds, visibleAssigneeSummary }) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <ResourceTypeBadge
                                    type={type}
                                    iconOnly
                                    className="border-transparent"
                                    labelOverride={type === "subcontractor" ? "Subcontractor" : "Employee"}
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {type === "subcontractor" ? "Subcontractor" : "Employee"}
                              </TooltipContent>
                            </Tooltip>
                            {item.taskId ? (
                              <button
                                type="button"
                                className="font-medium text-foreground underline-offset-4 hover:underline"
                                onClick={() => {
                                  navigate(`/project/${pid}/tasks`, { state: { openTaskId: item.taskId } });
                                }}
                              >
                                {title}
                              </button>
                            ) : (
                              <span className="font-medium text-foreground">{title}</span>
                            )}
                            {item.lockedFromEstimate && <Badge variant="outline">Locked</Badge>}
                            {item.orphaned && <Badge variant="destructive">Orphaned</Badge>}
                          </div>
                          {task && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                              onClick={() => {
                                navigate(`/project/${pid}/tasks`, { state: { openTaskId: task.id } });
                              }}
                            >
                              Open in Tasks
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 max-w-[180px]"
                              disabled={!canEdit || shouldBlockHRLaunchActions}
                            >
                              <span className="truncate">{visibleAssigneeSummary}</span>
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
                                  disabled={!canEdit || shouldBlockHRLaunchActions}
                                  onCheckedChange={(nextChecked) => {
                                    if (!canEdit || shouldBlockHRLaunchActions) return;
                                    const nextIds = nextChecked === true
                                      ? Array.from(new Set([...assigneeIds, participant.id]))
                                      : assigneeIds.filter((id) => id !== participant.id);
                                    void hrMutations.setAssignees(item.id, [...nextIds, ...hiddenAssigneeIds]).catch((error) => {
                                      toast({
                                        title: error instanceof Error
                                          ? error.message
                                          : "Unable to update assignees",
                                        variant: "destructive",
                                      });
                                    });
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
                        <Badge variant="outline">
                          {statusLabel(workStatus)}
                        </Badge>
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
                            disabled={!canEdit || shouldBlockHRLaunchActions}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canEdit || shouldBlockHRLaunchActions || !paymentDraftByItemId[item.id]}
                            onClick={() => {
                              const amount = Number(paymentDraftByItemId[item.id] ?? 0);
                              if (!Number.isFinite(amount) || amount <= 0) return;
                              void hrMutations.createPayment({
                                hrItemId: item.id,
                                amount,
                                paidAt: new Date().toISOString(),
                              }).then(() => {
                                setPaymentDraftByItemId((prev) => ({ ...prev, [item.id]: "" }));
                                toast({ title: "Payment added" });
                              }).catch((error) => {
                                toast({
                                  title: error instanceof Error
                                    ? error.message
                                    : "Unable to add payment",
                                  variant: "destructive",
                                });
                              });
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
