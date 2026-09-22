/**
 * Queue ordering for an area (BRIEF §10): unassigned first, then the most
 * pressing. Until SLA exists (phase 4) "most pressing" is priority, then age.
 * Resolved tickets go last: they wait on the requester, not on the agent.
 */
import type { Priority, TicketStatus } from "./types";

export interface QueueItem {
  status: TicketStatus;
  priority: Priority;
  assigneeId: string | null;
  createdAt: string; // ISO
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function group(item: QueueItem): number {
  if (item.status === "resolved") return 2;
  if (item.assigneeId === null) return 0;
  return 1;
}

export function compareQueueItems(a: QueueItem, b: QueueItem): number {
  const g = group(a) - group(b);
  if (g !== 0) return g;
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export function sortQueue<T extends QueueItem>(items: readonly T[]): T[] {
  return [...items].sort(compareQueueItems);
}
