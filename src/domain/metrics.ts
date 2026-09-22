/**
 * Dashboard metrics (BRIEF §10), computed from tickets and their SLA results.
 * Pure: the caller decides the scope (area or all) and passes `now`.
 */
import type { SlaResult } from "./sla";
import type { TicketStatus } from "./types";

export interface MetricTicket {
  id: string;
  status: TicketStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  sla: SlaResult;
}

export const ACTIVE_STATUSES = ["open", "in_progress", "waiting", "resolved"] as const;
export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export interface DashboardMetrics {
  /** Active tickets by status. `resolved` waits on the requester but is still open work. */
  openByStatus: Record<ActiveStatus, number>;
  activeTotal: number;
  unassigned: number;
  loadByAgent: { assigneeId: string; name: string; count: number }[];
  /** Tickets whose clock stopped inside the window. */
  resolvedInWindow: number;
  /** Mean net hours (waiting discounted) of those tickets. Null when none. */
  meanResolutionHours: number | null;
  /** Share of those tickets resolved within target, 0..1. Null when none. */
  slaComplianceRate: number | null;
  overdue: MetricTicket[];
  atRisk: MetricTicket[];
}

export function isActive(status: TicketStatus): status is ActiveStatus {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function computeMetrics(tickets: readonly MetricTicket[], now: Date, windowDays = 30): DashboardMetrics {
  const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
  const active = tickets.filter((t) => isActive(t.status));

  const openByStatus: Record<ActiveStatus, number> = { open: 0, in_progress: 0, waiting: 0, resolved: 0 };
  for (const t of active) openByStatus[t.status as ActiveStatus] += 1;

  const load = new Map<string, { assigneeId: string; name: string; count: number }>();
  for (const t of active) {
    if (!t.assigneeId) continue;
    const entry = load.get(t.assigneeId) ?? { assigneeId: t.assigneeId, name: t.assigneeName ?? "", count: 0 };
    entry.count += 1;
    load.set(t.assigneeId, entry);
  }
  const loadByAgent = [...load.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const resolved = tickets.filter(
    (t) => t.sla.applicable && t.sla.stoppedAt !== null && t.sla.stoppedAt.getTime() >= windowStart.getTime() && t.sla.stoppedAt.getTime() <= now.getTime(),
  );
  const meanResolutionHours =
    resolved.length === 0 ? null : resolved.reduce((sum, t) => sum + t.sla.activeHours, 0) / resolved.length;
  const slaComplianceRate =
    resolved.length === 0 ? null : resolved.filter((t) => t.sla.ratio < 1).length / resolved.length;

  const byRatioDesc = (a: MetricTicket, b: MetricTicket) => b.sla.ratio - a.sla.ratio;
  const overdue = active.filter((t) => t.sla.applicable && t.sla.state === "breached").sort(byRatioDesc);
  const atRisk = active.filter((t) => t.sla.applicable && t.sla.state === "at_risk").sort(byRatioDesc);

  return {
    openByStatus,
    activeTotal: active.length,
    unassigned: active.filter((t) => t.assigneeId === null).length,
    loadByAgent,
    resolvedInWindow: resolved.length,
    meanResolutionHours,
    slaComplianceRate,
    overdue,
    atRisk,
  };
}
