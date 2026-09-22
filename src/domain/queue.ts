/**
 * Queue ordering for an area (BRIEF §10): unassigned first, then the most
 * compromised SLA, then the oldest. Resolved tickets go last: they wait on
 * the requester, not on the agent.
 */
import type { TicketStatus } from "./types";

export interface QueueItem {
  status: TicketStatus;
  assigneeId: string | null;
  /** SLA consumed ratio (1 = on the limit). 0 when not applicable. */
  slaRatio: number;
  createdAt: string; // ISO
}

function group(item: QueueItem): number {
  if (item.status === "resolved") return 2;
  if (item.assigneeId === null) return 0;
  return 1;
}

export function compareQueueItems(a: QueueItem, b: QueueItem): number {
  const g = group(a) - group(b);
  if (g !== 0) return g;
  const r = b.slaRatio - a.slaRatio;
  if (r !== 0) return r;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export function sortQueue<T extends QueueItem>(items: readonly T[]): T[] {
  return [...items].sort(compareQueueItems);
}
