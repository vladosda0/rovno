import { useState, useEffect, useCallback } from "react";
import * as store from "@/data/store";
import { getProcurementItems, subscribeProcurement } from "@/data/procurement-store";
import { getHRItems, getHRPayments, subscribeHR } from "@/data/hr-store";
import {
  usePlanningProjectStages,
  usePlanningProjectTasks,
} from "@/hooks/use-planning-source";
import {
  useWorkspaceCurrentUser,
  useWorkspaceProject,
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
  const getter = useCallback(() => getProcurementItems(projectId), [projectId]);
  const [value, setValue] = useState(getter);
  useEffect(() => {
    const update = () => setValue(getter());
    const unsub1 = subscribeProcurement(update);
    return unsub1;
  }, [getter]);
  return value;
}

export function useHRItems(projectId: string) {
  const getter = useCallback(() => getHRItems(projectId), [projectId]);
  const [value, setValue] = useState(getter);
  useEffect(() => {
    const update = () => setValue(getter());
    const unsub = subscribeHR(update);
    return unsub;
  }, [getter]);
  return value;
}

export function useHRPayments(projectId: string) {
  const getter = useCallback(() => getHRPayments(projectId), [projectId]);
  const [value, setValue] = useState(getter);
  useEffect(() => {
    const update = () => setValue(getter());
    const unsub = subscribeHR(update);
    return unsub;
  }, [getter]);
  return value;
}

export function useDocuments(projectId: string) {
  const getter = useCallback(() => store.getDocuments(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useMedia(projectId: string) {
  const getter = useCallback(() => store.getMedia(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useEvents(projectId: string) {
  const getter = useCallback(() => store.getEvents(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useNotifications() {
  const user = useCurrentUser();
  const getter = useCallback(() => store.getNotifications(user.id), [user.id]);
  const countGetter = useCallback(() => store.getUnreadNotificationCount(user.id), [user.id]);
  const notifications = useStoreSubscription(getter);
  const unreadCount = useStoreSubscription(countGetter);
  return { notifications, unreadCount };
}

export { usePermission } from "@/lib/permissions";
