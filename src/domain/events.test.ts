import { describe, expect, it } from "vitest";
import { buildTransitionEvent, parseEventPayload } from "./events";
import { findTransition } from "./stateMachine";
import type { TicketStatus } from "./types";

function t(from: TicketStatus, to: TicketStatus) {
  const found = findTransition(from, to);
  if (!found) throw new Error(`no transition ${from}->${to}`);
  return found;
}

describe("buildTransitionEvent", () => {
  it("take emits taken with the actor as assignee", () => {
    expect(
      buildTransitionEvent(t("open", "in_progress"), { actorId: "agent-1", currentAssigneeId: null }),
    ).toEqual({ type: "taken", payload: { assignee_id: "agent-1" } });
  });

  it("release emits released with the previous assignee, even when a supervisor releases", () => {
    expect(
      buildTransitionEvent(t("in_progress", "open"), {
        actorId: "sup-1",
        currentAssigneeId: "agent-1",
        reason: "  Agente ausente ",
      }),
    ).toEqual({ type: "released", payload: { assignee_id: "agent-1", reason: "Agente ausente" } });
  });

  it("release without an assignee is a programming error", () => {
    expect(() =>
      buildTransitionEvent(t("in_progress", "open"), { actorId: "sup-1", currentAssigneeId: null }),
    ).toThrow();
  });

  it.each<[TicketStatus, TicketStatus]>([
    ["in_progress", "waiting"],
    ["waiting", "in_progress"],
    ["in_progress", "resolved"],
    ["resolved", "closed"],
    ["resolved", "in_progress"],
    ["open", "cancelled"],
  ])("%s -> %s emits status_changed", (from, to) => {
    const event = buildTransitionEvent(t(from, to), {
      actorId: "x",
      currentAssigneeId: "agent-1",
      reason: "motivo",
    });
    expect(event).toEqual({ type: "status_changed", payload: { reason: "motivo" } });
  });

  it("omits the reason when blank", () => {
    expect(
      buildTransitionEvent(t("resolved", "closed"), { actorId: "req", currentAssigneeId: "a", reason: "  " }),
    ).toEqual({ type: "status_changed", payload: {} });
  });
});

describe("parseEventPayload", () => {
  it("accepts the payloads the seed and the RPC produce", () => {
    expect(parseEventPayload("created", { priority: "high", priority_source: "category_default" })).toEqual({
      priority: "high",
      priority_source: "category_default",
    });
    expect(parseEventPayload("taken", { assignee_id: "a" })).toEqual({ assignee_id: "a" });
    expect(parseEventPayload("status_changed", {})).toEqual({});
    expect(parseEventPayload("priority_changed", { from: "high", to: "medium", reason: "r" })).toEqual({
      from: "high",
      to: "medium",
      reason: "r",
    });
  });

  it("rejects a malformed payload", () => {
    expect(() => parseEventPayload("created", { priority: "urgent" })).toThrow();
    expect(() => parseEventPayload("priority_changed", { from: "high", to: "low" })).toThrow();
  });
});
