import { useState, useEffect, useCallback } from "react";
import * as store from "@/data/store";
import {
  useActivityNotificationsBridge,
  useProjectEvents,
} from "@/hooks/use-activity-source";
import {
  useProjectDocuments,
  useProjectMedia,
} from "@/hooks/use-documents-media-source";
import {
  useProjectHRItems,
  useProjectHRPayments,
} from "@/hooks/use-hr-source";
import {
  usePlanningProjectStages,
  usePlanningProjectTasks,
} from "@/hooks/use-planning-source";
import { useProjectProcurementItems } from "@/hooks/use-procurement-source";
import {
  useWorkspaceCurrentUser,
  useWorkspaceMode,
  useWorkspaceProject,
  useWorkspaceProjectInvites,
  useWorkspaceProjectMembers,
  useWorkspaceProjects,
} from "@/hooks/use-workspace-source";

function useStoreSubscription<T>(getter: () => T): T {
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return store.subscribe(update);
  }, [getter]);

  return value;
}

export function useCurrentUser() {
  return useWorkspaceCurrentUser();
}

export function useProjects() {
  return useWorkspaceProjects();
}

export function useProject(id: string) {
  const project = useWorkspaceProject(id);
  const members = useWorkspaceProjectMembers(id);
  const stages = usePlanningProjectStages(id);
  return { project, members, stages };
}

export function useProjectInvites(projectId: string) {
  return useWorkspaceProjectInvites(projectId);
}

export function useTasks(projectId: string) {
  return usePlanningProjectTasks(projectId);
}

export function useEstimate(projectId: string) {
  const getter = useCallback(() => store.getEstimate(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useContractorProposals(projectId: string) {
  const getter = useCallback(() => store.getContractorProposals(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useProcurement(projectId: string) {
  const getter = useCallback(() => store.getProcurementItems(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useProcurementV2(projectId: string) {
  return useProjectProcurementItems(projectId);
}

export function useHRItems(projectId: string, options?: { enabled?: boolean }) {
  return useProjectHRItems(projectId, options);
}

export function useHRPayments(projectId: string, options?: { enabled?: boolean }) {
  return useProjectHRPayments(projectId, options);
}

export function useDocuments(projectId: string) {
  return useProjectDocuments(projectId);
}

export function useMedia(projectId: string) {
  return useProjectMedia(projectId);
}

export function useEvents(projectId: string) {
  return useProjectEvents(projectId);
}

export function useNotifications() {
  const { notifications, unreadCount } = useActivityNotificationsBridge();
  return { notifications, unreadCount };
}

export { usePermission } from "@/lib/permissions";
export { useWorkspaceMode };
