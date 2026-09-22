import { describe, expect, it } from "vitest";
import { computeSla, resolveTargets, stateFor, type SlaEvent, type SlaTargets } from "./sla";
import type { Priority, TicketStatus } from "./types";

const T0 = new Date("2026-09-01T08:00:00Z");
const h = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);
const targets: SlaTargets = { high: 4, medium: 24, low: 72 };

function created(priority: Priority): SlaEvent {
  return { type: "created", fromStatus: null, toStatus: "open", payload: { priority }, createdAt: T0 };
}
function status(at: number, from: TicketStatus, to: TicketStatus): SlaEvent {
  const type = to === "in_progress" && from === "open" ? "taken" : from === "in_progress" && to === "open" ? "released" : "status_changed";
  return { type, fromStatus: from, toStatus: to, payload: {}, createdAt: h(at) };
}
function prio(at: number, from: Priority, to: Priority): SlaEvent {
  return { type: "priority_changed", fromStatus: null, toStatus: null, payload: { from, to }, createdAt: h(at) };
}

function sla(status: TicketStatus, events: SlaEvent[], nowHours: number, initial: Priority = "medium") {
  return computeSla({ createdAt: T0, status, initialPriority: initial, events, targets, now: h(nowHours) });
}

describe("resolveTargets", () => {
  const policies = [
    { priority: "high" as const, areaId: null, resolutionHours: 4 },
    { priority: "medium" as const, areaId: null, resolutionHours: 24 },
    { priority: "low" as const, areaId: null, resolutionHours: 72 },
    { priority: "high" as const, areaId: "mant", resolutionHours: 2 },
  ];

  it("uses the default policies when the area has none", () => {
    expect(resolveTargets(policies, "ti")).toEqual({ high: 4, medium: 24, low: 72 });
  });

  it("prefers the area policy for the priorities that have one", () => {
    expect(resolveTargets(policies, "mant")).toEqual({ high: 2, medium: 24, low: 72 });
  });

  it("throws when a priority has no policy at all", () => {
    expect(() => resolveTargets(policies.slice(0, 2), "ti")).toThrow(/low/);
  });
});

describe("computeSla: running clock", () => {
  it("counts elapsed time since creation for an open ticket", () => {
    const r = sla("open", [created("medium")], 6);
    expect(r.applicable).toBe(true);
    expect(r.activeHours).toBe(6);
    expect(r.waitingHours).toBe(0);
    expect(r.ratio).toBeCloseTo(0.25);
    expect(r.state).toBe("on_track");
    expect(r.stopped).toBe(false);
    expect(r.paused).toBe(false);
    expect(r.deadline).toEqual(h(24));
  });

  it("discounts one waiting stretch", () => {
    const r = sla("in_progress", [created("medium"), status(1, "open", "in_progress"), status(2, "in_progress", "waiting"), status(10, "waiting", "in_progress")], 12);
    expect(r.activeHours).toBe(4);
    expect(r.waitingHours).toBe(8);
    expect(r.deadline).toEqual(h(32));
  });

  it("discounts several waiting stretches", () => {
    const r = sla(
      "in_progress",
      [created("low"), status(1, "open", "in_progress"), status(2, "in_progress", "waiting"), status(5, "waiting", "in_progress"), status(6, "in_progress", "waiting"), status(16, "waiting", "in_progress")],
      20,
    );
    expect(r.activeHours).toBe(7);
    expect(r.waitingHours).toBe(13);
  });

  it("keeps discounting while currently waiting and reports the clock as paused", () => {
    const r = sla("waiting", [created("high"), status(0.5, "open", "in_progress"), status(1, "in_progress", "waiting")], 10);
    expect(r.activeHours).toBe(1);
    expect(r.waitingHours).toBe(9);
    expect(r.paused).toBe(true);
    expect(r.deadline).toBeNull();
    expect(r.state).toBe("on_track");
  });

  it("marks at risk from 75% and breached from 100%", () => {
    expect(sla("open", [created("high")], 2.99).state).toBe("on_track");
    expect(sla("open", [created("high")], 3).state).toBe("at_risk");
    expect(sla("open", [created("high")], 3.99).state).toBe("at_risk");
    expect(sla("open", [created("high")], 4).state).toBe("breached");
  });

  it("keeps the original deadline once breached", () => {
    const r = sla("open", [created("high")], 30);
    expect(r.state).toBe("breached");
    expect(r.deadline).toEqual(h(4));
    expect(r.ratio).toBeCloseTo(7.5);
  });
});

describe("computeSla: stopped clock", () => {
  it("stops at the transition to resolved and ignores time after it", () => {
    const r = sla("resolved", [created("medium"), status(1, "open", "in_progress"), status(5, "in_progress", "resolved")], 100);
    expect(r.stopped).toBe(true);
    expect(r.activeHours).toBe(5);
    expect(r.state).toBe("on_track");
    expect(r.deadline).toBeNull();
  });

  it("uses the last resolution when closed, and the time between resolved and reopened counts", () => {
    const r = sla(
      "closed",
      [created("high"), status(0.5, "open", "in_progress"), status(2, "in_progress", "resolved"), status(3, "resolved", "in_progress"), status(5, "in_progress", "resolved"), status(20, "resolved", "closed")],
      100,
    );
    expect(r.activeHours).toBe(5);
    expect(r.state).toBe("breached");
    expect(r.deadline).toEqual(h(4));
  });

  it("a stopped ticket is never at risk, only on track or breached", () => {
    expect(stateFor(0.9, true)).toBe("on_track");
    expect(stateFor(0.9, false)).toBe("at_risk");
    expect(stateFor(1, true)).toBe("breached");
  });

  it("cancelled tickets have no SLA", () => {
    const r = sla("cancelled", [created("high"), status(1, "open", "cancelled")], 50);
    expect(r.applicable).toBe(false);
    expect(r.ratio).toBe(0);
  });
});

describe("computeSla: priority segments", () => {
  it("measures each segment against its own target", () => {
    // 2h as high (2/4 = 0.5) then 6h as medium (6/24 = 0.25) => 0.75
    const r = sla("in_progress", [created("high"), status(0.5, "open", "in_progress"), prio(2, "high", "medium")], 8);
    expect(r.ratio).toBeCloseTo(0.75);
    expect(r.state).toBe("at_risk");
    expect(r.currentTargetHours).toBe(24);
    // remaining 0.25 of a 24h target = 6h after now
    expect(r.deadline).toEqual(h(14));
  });

  it("lowering the priority does not rewrite hours that ran under the higher target", () => {
    // 5h as high already breached (5/4). Lowering to low does not un-breach it.
    const r = sla("in_progress", [created("high"), status(0.5, "open", "in_progress"), prio(5, "high", "low")], 6);
    expect(r.state).toBe("breached");
    expect(r.deadline).toEqual(h(4));
  });

  it("raising the priority makes the remaining budget shrink", () => {
    // 12h as medium (0.5) then high: remaining 0.5 * 4h = 2h
    const r = sla("in_progress", [created("medium"), status(1, "open", "in_progress"), prio(12, "medium", "high")], 12);
    expect(r.ratio).toBeCloseTo(0.5);
    expect(r.deadline).toEqual(h(14));
  });

  it("a priority change while waiting does not consume time", () => {
    const r = sla("waiting", [created("high"), status(0.5, "open", "in_progress"), status(1, "in_progress", "waiting"), prio(2, "high", "low")], 5);
    expect(r.activeHours).toBe(1);
    expect(r.waitingHours).toBe(4);
    expect(r.currentTargetHours).toBe(72);
  });

  it("falls back to the initial priority when there is no created event", () => {
    const r = sla("open", [], 2, "high");
    expect(r.ratio).toBeCloseTo(0.5);
  });
});
