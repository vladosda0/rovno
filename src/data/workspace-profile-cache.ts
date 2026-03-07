import type { User } from "@/types/entities";

const workspaceUsers = new Map<string, User>();

export function cacheWorkspaceUsers(users: User[]): void {
  users.forEach((user) => {
    if (!user.id) return;
    workspaceUsers.set(user.id, user);
  });
}

export function getCachedWorkspaceUser(id: string): User | undefined {
  return workspaceUsers.get(id);
}

export function __unsafeResetWorkspaceUserCacheForTests(): void {
  workspaceUsers.clear();
}
