import { useState, useEffect, useCallback } from "react";
import * as store from "@/data/store";

function useStoreSubscription<T>(getter: () => T): T {
  const [value, setValue] = useState(getter);

  useEffect(() => {
    const update = () => setValue(getter());
    return store.subscribe(update);
  }, [getter]);

  return value;
}

export function useCurrentUser() {
  return useStoreSubscription(store.getCurrentUser);
}

export function useProjects() {
  return useStoreSubscription(store.getProjects);
}

export function useProject(id: string) {
  const getProject = useCallback(() => store.getProject(id), [id]);
  const getMembers = useCallback(() => store.getMembers(id), [id]);
  const getStages = useCallback(() => store.getStages(id), [id]);
  const project = useStoreSubscription(getProject);
  const members = useStoreSubscription(getMembers);
  const stages = useStoreSubscription(getStages);
  return { project, members, stages };
}

export function useTasks(projectId: string) {
  const getter = useCallback(() => store.getTasks(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useEstimate(projectId: string) {
  const getter = useCallback(() => store.getEstimate(projectId), [projectId]);
  return useStoreSubscription(getter);
}

export function useProcurement(projectId: string) {
  const getter = useCallback(() => store.getProcurementItems(projectId), [projectId]);
  return useStoreSubscription(getter);
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
