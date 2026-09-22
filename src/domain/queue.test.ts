import { describe, expect, it } from "vitest";
import { sortQueue, type QueueItem } from "./queue";

function item(overrides: Partial<QueueItem> & { id: string }): QueueItem & { id: string } {
  return { status: "open", priority: "medium", assigneeId: null, createdAt: "2026-09-20T10:00:00Z", ...overrides };
}

describe("sortQueue", () => {
  it("puts unassigned tickets before assigned ones regardless of priority", () => {
    const sorted = sortQueue([
      item({ id: "assigned-high", status: "in_progress", assigneeId: "a", priority: "high" }),
      item({ id: "open-low", priority: "low" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["open-low", "assigned-high"]);
  });

  it("orders by priority high, medium, low inside a group", () => {
    const sorted = sortQueue([
      item({ id: "low", priority: "low" }),
      item({ id: "high", priority: "high" }),
      item({ id: "medium", priority: "medium" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["high", "medium", "low"]);
  });

  it("orders oldest first when priority ties", () => {
    const sorted = sortQueue([
      item({ id: "newer", createdAt: "2026-09-21T10:00:00Z" }),
      item({ id: "older", createdAt: "2026-09-19T10:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["older", "newer"]);
  });

  it("puts resolved tickets last, after assigned ones", () => {
    const sorted = sortQueue([
      item({ id: "resolved", status: "resolved", assigneeId: "a", priority: "high", createdAt: "2026-09-01T00:00:00Z" }),
      item({ id: "waiting", status: "waiting", assigneeId: "a", priority: "low" }),
      item({ id: "open" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["open", "waiting", "resolved"]);
  });

  it("does not mutate the input", () => {
    const input = [item({ id: "b", priority: "low" }), item({ id: "a", priority: "high" })];
    sortQueue(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
