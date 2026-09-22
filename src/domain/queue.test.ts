import { describe, expect, it } from "vitest";
import { sortQueue, type QueueItem } from "./queue";

function item(overrides: Partial<QueueItem> & { id: string }): QueueItem & { id: string } {
  return { status: "open", assigneeId: null, slaRatio: 0.5, createdAt: "2026-09-20T10:00:00Z", ...overrides };
}

describe("sortQueue", () => {
  it("puts unassigned tickets before assigned ones regardless of SLA", () => {
    const sorted = sortQueue([
      item({ id: "assigned-late", status: "in_progress", assigneeId: "a", slaRatio: 2 }),
      item({ id: "open-fresh", slaRatio: 0.1 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["open-fresh", "assigned-late"]);
  });

  it("orders by most compromised SLA inside a group", () => {
    const sorted = sortQueue([
      item({ id: "ok", slaRatio: 0.2 }),
      item({ id: "breached", slaRatio: 1.4 }),
      item({ id: "risk", slaRatio: 0.8 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["breached", "risk", "ok"]);
  });

  it("orders oldest first when the SLA ties", () => {
    const sorted = sortQueue([
      item({ id: "newer", createdAt: "2026-09-21T10:00:00Z" }),
      item({ id: "older", createdAt: "2026-09-19T10:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("puts resolved tickets last, after assigned ones", () => {
    const sorted = sortQueue([
      item({ id: "resolved", status: "resolved", assigneeId: "a", slaRatio: 3 }),
      item({ id: "waiting", status: "waiting", assigneeId: "a", slaRatio: 0.1 }),
      item({ id: "open" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["open", "waiting", "resolved"]);
  });

  it("does not mutate the input", () => {
    const input = [item({ id: "b", slaRatio: 0.1 }), item({ id: "a", slaRatio: 0.9 })];
    sortQueue(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
