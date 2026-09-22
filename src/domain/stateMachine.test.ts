import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  canTransition,
  findTransition,
  isTerminal,
  transitionsFrom,
  validateTransition,
} from "./stateMachine";
import { TICKET_STATUSES, type TicketStatus } from "./types";

/** Full table from BRIEF §8. Anything not listed here must be rejected. */
const ALLOWED: ReadonlyArray<[TicketStatus, TicketStatus]> = [
  ["open", "in_progress"],
  ["in_progress", "open"],
  ["in_progress", "waiting"],
  ["waiting", "in_progress"],
  ["in_progress", "resolved"],
  ["resolved", "closed"],
  ["resolved", "in_progress"],
  ["open", "cancelled"],
];

describe("transition table", () => {
  it("contains exactly the transitions of the BRIEF", () => {
    const actual = TRANSITIONS.map((t) => `${t.from}->${t.to}`).sort();
    const expected = ALLOWED.map(([f, t]) => `${f}->${t}`).sort();
    expect(actual).toEqual(expected);
  });

  it.each(TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.map((to) => [from, to] as const)))(
    "%s -> %s is allowed only when listed",
    (from, to) => {
      const listed = ALLOWED.some(([f, t]) => f === from && t === to);
      expect(canTransition(from, to)).toBe(listed);
    },
  );

  it("terminal statuses have no outgoing transitions", () => {
    expect(isTerminal("closed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(transitionsFrom("closed")).toEqual([]);
    expect(transitionsFrom("cancelled")).toEqual([]);
    for (const s of ["open", "in_progress", "waiting", "resolved"] as const) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});

describe("who and what each transition requires", () => {
  it("take assigns and is for an agent of the area", () => {
    expect(findTransition("open", "in_progress")).toMatchObject({
      actor: "area_agent",
      assigneeEffect: "assign",
      requiresReason: false,
    });
  });

  it("release unassigns and is for the assignee or a supervisor", () => {
    expect(findTransition("in_progress", "open")).toMatchObject({
      actor: "assignee_or_supervisor",
      assigneeEffect: "unassign",
      requiresReason: false,
    });
  });

  it("waiting, resolved and reopen require a reason", () => {
    expect(findTransition("in_progress", "waiting")?.requiresReason).toBe(true);
    expect(findTransition("in_progress", "resolved")?.requiresReason).toBe(true);
    expect(findTransition("resolved", "in_progress")?.requiresReason).toBe(true);
  });

  it("resume, confirm and cancel do not require a reason", () => {
    expect(findTransition("waiting", "in_progress")?.requiresReason).toBe(false);
    expect(findTransition("resolved", "closed")?.requiresReason).toBe(false);
    expect(findTransition("open", "cancelled")?.requiresReason).toBe(false);
  });

  it("confirm, reopen and cancel belong to the requester", () => {
    expect(findTransition("resolved", "closed")?.actor).toBe("requester");
    expect(findTransition("resolved", "in_progress")?.actor).toBe("requester");
    expect(findTransition("open", "cancelled")?.actor).toBe("requester");
  });

  it("reopen keeps the assignee", () => {
    expect(findTransition("resolved", "in_progress")?.assigneeEffect).toBeNull();
  });
});

describe("validateTransition", () => {
  it("rejects an unknown transition", () => {
    expect(validateTransition({ from: "open", to: "resolved" })).toEqual({
      ok: false,
      error: "invalid_transition",
    });
  });

  it("rejects a missing or blank reason when required", () => {
    expect(validateTransition({ from: "in_progress", to: "waiting" })).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(
      validateTransition({ from: "in_progress", to: "resolved", reason: "   " }),
    ).toEqual({ ok: false, error: "reason_required" });
  });

  it("accepts a required reason when present", () => {
    const result = validateTransition({
      from: "in_progress",
      to: "resolved",
      reason: "Se reinició el servicio",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a transition that needs no reason, with or without one", () => {
    expect(validateTransition({ from: "open", to: "in_progress" }).ok).toBe(true);
    expect(
      validateTransition({ from: "resolved", to: "closed", reason: "gracias" }).ok,
    ).toBe(true);
  });
});
