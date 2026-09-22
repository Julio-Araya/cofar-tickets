import { describe, expect, it } from "vitest";
import { computeMetrics, type MetricTicket } from "./metrics";
import type { SlaResult } from "./sla";
import type { TicketStatus } from "./types";

const NOW = new Date("2026-09-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function slaOf(overrides: Partial<SlaResult> = {}): SlaResult {
  return {
    applicable: true,
    state: "on_track",
    ratio: 0.2,
    activeHours: 2,
    waitingHours: 0,
    stopped: false,
    paused: false,
    deadline: null,
    currentTargetHours: 24,
    stoppedAt: null,
    ...overrides,
  };
}

function t(id: string, status: TicketStatus, assignee: string | null, sla: Partial<SlaResult> = {}): MetricTicket {
  return { id, status, assigneeId: assignee, assigneeName: assignee ? `Agent ${assignee}` : null, sla: slaOf(sla) };
}

describe("computeMetrics", () => {
  const tickets: MetricTicket[] = [
    t("1", "open", null, { ratio: 1.5, state: "breached" }),
    t("2", "open", null, { ratio: 0.8, state: "at_risk" }),
    t("3", "in_progress", "a", { ratio: 0.3 }),
    t("4", "waiting", "a", { ratio: 0.5, paused: true }),
    t("5", "resolved", "b", { ratio: 0.4, stopped: true, stoppedAt: daysAgo(1), activeHours: 10 }),
    t("6", "closed", "b", { ratio: 1.2, state: "breached", stopped: true, stoppedAt: daysAgo(5), activeHours: 30 }),
    t("7", "closed", "a", { ratio: 0.5, stopped: true, stoppedAt: daysAgo(40), activeHours: 100 }),
    t("8", "cancelled", null, { applicable: false, ratio: 0 }),
  ];
  const m = computeMetrics(tickets, NOW);

  it("counts active tickets by status", () => {
    expect(m.openByStatus).toEqual({ open: 2, in_progress: 1, waiting: 1, resolved: 1 });
    expect(m.activeTotal).toBe(5);
  });

  it("counts unassigned active tickets", () => {
    expect(m.unassigned).toBe(2);
  });

  it("computes load per agent over active tickets only", () => {
    expect(m.loadByAgent).toEqual([
      { assigneeId: "a", name: "Agent a", count: 2 },
      { assigneeId: "b", name: "Agent b", count: 1 },
    ]);
  });

  it("uses only tickets resolved inside the 30-day window", () => {
    expect(m.resolvedInWindow).toBe(2);
    expect(m.meanResolutionHours).toBe(20);
    expect(m.slaComplianceRate).toBe(0.5);
  });

  it("lists overdue and at-risk active tickets", () => {
    expect(m.overdue.map((x) => x.id)).toEqual(["1"]);
    expect(m.atRisk.map((x) => x.id)).toEqual(["2"]);
  });

  it("returns nulls when nothing was resolved in the window", () => {
    const empty = computeMetrics([t("1", "open", null)], NOW);
    expect(empty.meanResolutionHours).toBeNull();
    expect(empty.slaComplianceRate).toBeNull();
    expect(empty.resolvedInWindow).toBe(0);
  });
});
