import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Calculator, Plus, Trash2, ChevronDown, ChevronRight, Receipt, Link2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EmptyState } from "@/components/EmptyState";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useProject, useTasks, usePermission } from "@/hooks/use-mock-data";
import { useStageEstimateItems } from "@/hooks/use-estimate-data";
import { getCurrentUser, addTask } from "@/data/store";
import {
  addStageEstimateItem, updateStageEstimateItem, deleteStageEstimateItem,
  unlinkEstimateItem, deleteEstimateItemsForTask, countLinkedEstimateItems,
  inferItemType, getEstimateItemBySourceId,
  type StageEstimateItem, type EstimateItemType,
} from "@/data/estimate-store";
import { addChecklistItem as storeAddChecklistItem } from "@/data/store";
import { createEstimateItemForChecklist } from "@/data/estimate-store";
import type { Task, ChecklistItem } from "@/types/entities";

/* ---------- helpers ---------- */
function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

const UNITS = ["m²", "m", "pcs", "set", "project", "points", "units", "kg", "l", "hrs"];

export default function ProjectEstimate() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { project, stages } = useProject(pid);
  const tasks = useTasks(pid);
  const perm = usePermission(pid);
  const user = getCurrentUser();
  const isOwner = perm.role === "owner";
  const estimateItems = useStageEstimateItems(pid);

  // Collapsed state per stage
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  // Add item modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addStageId, setAddStageId] = useState("");
  const [addItemName, setAddItemName] = useState("");
  const [addPlanned, setAddPlanned] = useState("");
  const [addType, setAddType] = useState<EstimateItemType>("work");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addPaid, setAddPaid] = useState("");
  const [addLinkMode, setAddLinkMode] = useState<"task" | "checklist">("task");
  const [addTaskId, setAddTaskId] = useState("");

  // Delete confirm
  const [deleteItem, setDeleteItem] = useState<StageEstimateItem | null>(null);
  const [deleteMode, setDeleteMode] = useState<"item_only" | "both">("item_only");

  // Debounced input tracking
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Highlight newly created row
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (highlightId) {
      const t = setTimeout(() => setHighlightId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [highlightId]);

  const toggleStage = (stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  // --- Computed totals ---
  const totalPlanned = estimateItems.reduce((s, i) => s + i.planned, 0);
  const totalPaid = estimateItems.reduce((s, i) => s + (i.paid ?? 0), 0);
  const paidPct = totalPlanned > 0 ? Math.round((totalPaid / totalPlanned) * 100) : 0;
  const overBudget = totalPaid - totalPlanned;
  const hasUnplanned = estimateItems.some((i) => i.planned === 0);

  // Group items by stage, in stage order
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  function getStageItems(stageId: string): StageEstimateItem[] {
    const items = estimateItems.filter((i) => i.stageId === stageId);
    // Sort: linked items first (by createdAt), then MANUAL by createdAt
    return items.sort((a, b) => {
      const aLinked = a.sourceType !== "MANUAL" ? 0 : 1;
      const bLinked = b.sourceType !== "MANUAL" ? 0 : 1;
      if (aLinked !== bLinked) return aLinked - bLinked;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  // --- Debounced field update ---
  const debouncedUpdate = useCallback((itemId: string, field: string, value: unknown) => {
    const key = `${itemId}-${field}`;
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => {
      updateStageEstimateItem(itemId, { [field]: value });
    }, 400);
  }, []);

  // --- Add Item ---
  const openAddModal = (prefillStageId?: string) => {
    setAddStageId(prefillStageId || sortedStages[0]?.id || "");
    setAddItemName("");
    setAddPlanned("");
    setAddType("work");
    setAddQty("");
    setAddUnit("");
    setAddPaid("");
    setAddLinkMode("task");
    setAddTaskId("");
    setAddModalOpen(true);
  };

  const stageTasks = tasks.filter((t) => t.stage_id === addStageId);
  const canUseChecklist = addStageId && stageTasks.length > 0;

  const handleAddSubmit = () => {
    if (!addItemName.trim() || !addStageId || !addPlanned.trim()) return;
    const planned = parseFloat(addPlanned) || 0;
    const paid = addPaid ? parseFloat(addPaid) || 0 : null;
    const qty = addQty ? parseFloat(addQty) || null : null;
    const unit = addUnit || null;
    const type = addType;
    const now = new Date().toISOString();

    if (addLinkMode === "task") {
      // Create a task
      const taskId = `task-${Date.now()}`;
      const newTask: Task = {
        id: taskId,
        project_id: pid,
        stage_id: addStageId,
        title: addItemName.trim(),
        description: "",
        status: "not_started",
        assignee_id: user.id,
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: now,
      };
      addTask(newTask);

      const seiId = `sei-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      addStageEstimateItem({
        id: seiId,
        projectId: pid,
        stageId: addStageId,
        sourceType: "TASK",
        sourceId: taskId,
        itemName: addItemName.trim(),
        originalName: addItemName.trim(),
        isNameOverridden: false,
        type,
        qty,
        unit,
        planned,
        paid,
        receipts: [],
        createdAt: now,
        updatedAt: now,
      });
      setHighlightId(seiId);
    } else {
      // Create checklist item under selected task
      if (!addTaskId) return;
      const clId = `cl-${Date.now()}`;
      storeAddChecklistItem(addTaskId, { id: clId, text: addItemName.trim(), done: false });

      const parentTask = tasks.find((t) => t.id === addTaskId);
      const seiId = `sei-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      addStageEstimateItem({
        id: seiId,
        projectId: pid,
        stageId: addStageId,
        sourceType: "CHECKLIST",
        sourceId: clId,
        itemName: addItemName.trim(),
        originalName: addItemName.trim(),
        isNameOverridden: false,
        type,
        qty,
        unit,
        planned,
        paid,
        receipts: [],
        createdAt: now,
        updatedAt: now,
      });
      setHighlightId(seiId);
    }

    setAddModalOpen(false);
    toast({ title: "Item added", description: addItemName.trim() });
  };

  // --- Delete ---
  const handleDeleteConfirm = () => {
    if (!deleteItem) return;

    if (deleteItem.sourceType === "MANUAL" || deleteMode === "item_only") {
      if (deleteItem.sourceType !== "MANUAL" && deleteMode === "item_only") {
        unlinkEstimateItem(deleteItem.id);
      } else {
        deleteStageEstimateItem(deleteItem.id);
      }
    } else {
      // Delete both
      if (deleteItem.sourceType === "TASK" && deleteItem.sourceId) {
        const task = tasks.find((t) => t.id === deleteItem.sourceId);
        if (task) {
          deleteEstimateItemsForTask(task.id, task.checklist.map((c) => c.id));
          import("@/data/store").then(({ deleteTask }) => deleteTask(task.id));
        }
      } else if (deleteItem.sourceType === "CHECKLIST" && deleteItem.sourceId) {
        deleteStageEstimateItem(deleteItem.id);
        // Find and delete the checklist item from its task
        for (const t of tasks) {
          const cl = t.checklist.find((c) => c.id === deleteItem.sourceId);
          if (cl) {
            import("@/data/store").then(({ deleteChecklistItem }) => deleteChecklistItem(t.id, cl.id));
            break;
          }
        }
      }
    }

    setDeleteItem(null);
    toast({ title: "Deleted" });
  };

  const openDeleteConfirm = (item: StageEstimateItem) => {
    setDeleteItem(item);
    setDeleteMode("item_only");
  };

  // --- Handle inline name edit ---
  const handleNameChange = (item: StageEstimateItem, newName: string) => {
    updateStageEstimateItem(item.id, {
      itemName: newName,
      isNameOverridden: item.sourceType !== "MANUAL" && newName !== item.originalName,
    });
  };

  if (!project) {
    return <EmptyState icon={Calculator} title="Not found" description="Project not found." />;
  }

  if (sortedStages.length === 0) {
    return (
      <EmptyState
        icon={Calculator}
        title="No stages yet"
        description="Create stages in the Tasks tab first, then estimate items will appear here."
      />
    );
  }

  return (
    <div className="p-sp-2 space-y-sp-2">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-sp-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Estimate</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="secondary" className="text-caption">
                {estimateItems.length} items
              </Badge>
              <Badge variant="secondary" className="text-caption">
                Planned: {fmt(totalPlanned)}
              </Badge>
              <Badge variant="secondary" className="text-caption">
                Paid: {fmt(totalPaid)}
              </Badge>
              <Badge variant="secondary" className="text-caption">
                {paidPct}% paid
              </Badge>
            </div>
          </div>
          {isOwner && (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => openAddModal()}
            >
              <Plus className="h-4 w-4 mr-1" /> Add item
            </Button>
          )}
        </div>

        {/* Budget banners */}
        {overBudget >= 1 && totalPlanned > 0 && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-caption font-medium">
            ⚠ Budget exceeded — {fmt(overBudget)} over
          </div>
        )}
        {totalPlanned === 0 && totalPaid > 0 && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-info/10 text-info text-caption font-medium">
            ℹ Planned budget not set for some items
          </div>
        )}
        {hasUnplanned && totalPlanned > 0 && (
          <div className="mt-2 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-caption font-medium">
            ⚠ Some items have no planned budget set
          </div>
        )}
      </div>

      {/* Stage sections */}
      {sortedStages.map((stage) => {
        const stageItems = getStageItems(stage.id);
        const isOpen = !collapsedStages.has(stage.id);
        const stagePlanned = stageItems.reduce((s, i) => s + i.planned, 0);
        const stagePaid = stageItems.reduce((s, i) => s + (i.paid ?? 0), 0);

        return (
          <Collapsible key={stage.id} open={isOpen} onOpenChange={() => toggleStage(stage.id)}>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Stage header */}
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <h3 className="text-sm font-semibold text-foreground">{stage.title}</h3>
                    <span className="text-caption text-muted-foreground">({stageItems.length})</span>
                    {stagePlanned > 0 && (
                      <span className="text-caption text-muted-foreground ml-2">
                        {fmt(stagePaid)} / {fmt(stagePlanned)}
                      </span>
                    )}
                  </div>
                  {isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-caption"
                      onClick={(e) => { e.stopPropagation(); openAddModal(stage.id); }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add item
                    </Button>
                  )}
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                {stageItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead className="min-w-[180px]">Item</TableHead>
                          <TableHead className="w-24">Type</TableHead>
                          <TableHead className="w-20 text-right">Qty</TableHead>
                          <TableHead className="w-24">Unit</TableHead>
                          <TableHead className="w-28 text-right">Planned</TableHead>
                          <TableHead className="w-28 text-right">Paid</TableHead>
                          <TableHead className="w-20">Receipt</TableHead>
                          <TableHead className="w-20">Status</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stageItems.map((item, idx) => {
                          const isPaid = (item.paid ?? 0) > 0;
                          const isHighlighted = item.id === highlightId;
                          return (
                            <TableRow
                              key={item.id}
                              className={`${isPaid ? "bg-success/5" : ""} ${isHighlighted ? "ring-2 ring-accent/40 bg-accent/5" : ""}`}
                            >
                              <TableCell className="text-caption text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  {item.sourceType !== "MANUAL" && (
                                    <Link2 className="h-3 w-3 text-accent shrink-0" />
                                  )}
                                  {isOwner ? (
                                    <input
                                      className="text-sm font-medium text-foreground bg-transparent border-none outline-none w-full hover:bg-muted/30 focus:bg-muted/30 rounded px-1 py-0.5 -ml-1"
                                      defaultValue={item.itemName}
                                      onBlur={(e) => {
                                        if (e.target.value.trim() && e.target.value !== item.itemName) {
                                          handleNameChange(item, e.target.value.trim());
                                        }
                                      }}
                                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    />
                                  ) : (
                                    <span className="text-sm font-medium text-foreground">{item.itemName}</span>
                                  )}
                                </div>
                                {item.sourceType !== "MANUAL" && (
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.sourceType === "TASK" ? "Task" : "Checklist"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isOwner ? (
                                  <Select
                                    value={item.type}
                                    onValueChange={(v) => updateStageEstimateItem(item.id, { type: v as EstimateItemType })}
                                  >
                                    <SelectTrigger className="h-7 text-caption w-full border-none bg-transparent hover:bg-muted/30">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="work">Work</SelectItem>
                                      <SelectItem value="material">Material</SelectItem>
                                      <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className={`text-caption font-medium ${item.type === "work" ? "text-info" : item.type === "material" ? "text-warning" : "text-muted-foreground"}`}>
                                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isOwner ? (
                                  <input
                                    type="number"
                                    className="text-sm text-right bg-transparent border-none outline-none w-16 hover:bg-muted/30 focus:bg-muted/30 rounded px-1 py-0.5"
                                    defaultValue={item.qty ?? ""}
                                    placeholder="—"
                                    onChange={(e) => debouncedUpdate(item.id, "qty", e.target.value ? parseFloat(e.target.value) : null)}
                                  />
                                ) : (
                                  <span className="text-sm">{item.qty ?? "—"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isOwner ? (
                                  <Select
                                    value={item.unit ?? ""}
                                    onValueChange={(v) => updateStageEstimateItem(item.id, { unit: v || null })}
                                  >
                                    <SelectTrigger className="h-7 text-caption w-full border-none bg-transparent hover:bg-muted/30">
                                      <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {UNITS.map((u) => (
                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-caption text-muted-foreground">{item.unit ?? "—"}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isOwner ? (
                                  <input
                                    type="number"
                                    className="text-sm text-right font-medium bg-transparent border-none outline-none w-24 hover:bg-muted/30 focus:bg-muted/30 rounded px-1 py-0.5"
                                    defaultValue={item.planned}
                                    onChange={(e) => debouncedUpdate(item.id, "planned", parseFloat(e.target.value) || 0)}
                                  />
                                ) : (
                                  <span className="text-sm font-medium">{fmt(item.planned)}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {isOwner ? (
                                  <input
                                    type="number"
                                    className="text-sm text-right bg-transparent border-none outline-none w-24 hover:bg-muted/30 focus:bg-muted/30 rounded px-1 py-0.5"
                                    defaultValue={item.paid ?? ""}
                                    placeholder="0"
                                    onChange={(e) => debouncedUpdate(item.id, "paid", e.target.value ? parseFloat(e.target.value) : null)}
                                  />
                                ) : (
                                  <span className="text-sm">{item.paid != null ? fmt(item.paid) : "—"}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <button className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors">
                                  <Receipt className="h-3.5 w-3.5" />
                                  {item.receipts.length > 0 && (
                                    <Badge variant="secondary" className="h-4 text-[10px] px-1">{item.receipts.length}</Badge>
                                  )}
                                </button>
                              </TableCell>
                              <TableCell>
                                {isPaid ? (
                                  <Badge className="bg-success/15 text-success border-success/30 text-[10px]">Paid</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-warning border-warning/30 text-[10px]">Unpaid</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {isOwner && (
                                  <button
                                    onClick={() => openDeleteConfirm(item)}
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Stage totals */}
                        <TableRow className="font-semibold border-t-2">
                          <TableCell colSpan={5} className="text-caption text-foreground">Stage total</TableCell>
                          <TableCell className="text-right text-sm">{fmt(stagePlanned)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(stagePaid)}</TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="p-4 text-center text-caption text-muted-foreground">
                    No estimate items for this stage.
                    {isOwner && (
                      <Button
                        variant="link"
                        size="sm"
                        className="ml-1 text-accent"
                        onClick={() => openAddModal(stage.id)}
                      >
                        Add one
                      </Button>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {/* Grand total */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Grand Total</span>
          <div className="flex gap-4">
            <span className="text-sm font-semibold text-foreground">Planned: {fmt(totalPlanned)}</span>
            <span className="text-sm font-semibold text-foreground">Paid: {fmt(totalPaid)}</span>
          </div>
        </div>
      </div>

      {/* --- Add Item Modal --- */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-card border border-border rounded-modal max-w-md shadow-xl">
          <DialogHeader>
            <DialogTitle>Add estimate item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-caption">Item name *</Label>
              <Input
                value={addItemName}
                onChange={(e) => {
                  setAddItemName(e.target.value);
                  if (e.target.value.trim()) setAddType(inferItemType(e.target.value));
                }}
                placeholder="e.g. Tile installation"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-caption">Stage *</Label>
              <Select value={addStageId} onValueChange={setAddStageId}>
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {sortedStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-caption">Planned budget *</Label>
              <Input
                type="number"
                value={addPlanned}
                onChange={(e) => setAddPlanned(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-caption">Type</Label>
                <Select value={addType} onValueChange={(v) => setAddType(v as EstimateItemType)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-caption">Qty</Label>
                <Input type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} placeholder="—" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-caption">Unit</Label>
                <Select value={addUnit} onValueChange={setAddUnit}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-caption">Paid (optional)</Label>
              <Input type="number" value={addPaid} onChange={(e) => setAddPaid(e.target.value)} placeholder="0" />
            </div>

            {/* Link mode */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label className="text-caption font-semibold">Link to:</Label>
              <RadioGroup value={addLinkMode} onValueChange={(v) => setAddLinkMode(v as "task" | "checklist")}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="task" id="link-task" />
                  <Label htmlFor="link-task" className="text-caption">Create a task</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="checklist" id="link-checklist" disabled={!canUseChecklist} />
                  <Label htmlFor="link-checklist" className={`text-caption ${!canUseChecklist ? "text-muted-foreground" : ""}`}>
                    Create checklist item under existing task
                  </Label>
                </div>
              </RadioGroup>
              {addLinkMode === "checklist" && canUseChecklist && (
                <div className="space-y-1 mt-1">
                  <Label className="text-caption">Select task *</Label>
                  <Select value={addTaskId} onValueChange={setAddTaskId}>
                    <SelectTrigger><SelectValue placeholder="Choose a task" /></SelectTrigger>
                    <SelectContent>
                      {stageTasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {addLinkMode === "checklist" && !canUseChecklist && addStageId && (
                <p className="text-[11px] text-muted-foreground">No tasks in this stage. Create a task first or switch to "Create a task".</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!addItemName.trim() || !addStageId || !addPlanned.trim() || (addLinkMode === "checklist" && !addTaskId)}
              onClick={handleAddSubmit}
            >
              Add item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Delete confirm --- */}
      {deleteItem && (
        <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
          <DialogContent className="bg-card border border-border rounded-modal max-w-sm shadow-xl">
            <DialogHeader>
              <DialogTitle>Delete estimate item?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              "{deleteItem.itemName}"
            </p>
            {deleteItem.sourceType !== "MANUAL" && (
              <div className="space-y-2 mt-2">
                <RadioGroup value={deleteMode} onValueChange={(v) => setDeleteMode(v as "item_only" | "both")}>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="item_only" id="del-item" className="mt-0.5" />
                    <Label htmlFor="del-item" className="text-caption">
                      Delete estimate item only (keep {deleteItem.sourceType === "TASK" ? "task" : "checklist item"})
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="both" id="del-both" className="mt-0.5" />
                    <Label htmlFor="del-both" className="text-caption text-destructive">
                      Delete {deleteItem.sourceType === "TASK" ? "task" : "checklist item"} and estimate item
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
