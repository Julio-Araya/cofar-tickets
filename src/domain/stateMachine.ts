/**
 * Ticket state machine. Single source of truth for which status changes exist,
 * who may perform them and what they require. Pure: no I/O.
 *
 * Permission checks (is *this* user the assignee, the requester, etc.) live in
 * permissions.ts. This module only knows the shape of the graph.
 */
import type { TicketStatus } from "./types";

/** Which relationship to the ticket the actor must have. */
export type TransitionActor =
  | "area_agent" // an agent of the ticket's area
  | "assignee" // the agent currently assigned
  | "assignee_or_supervisor" // the assignee, or a supervisor of the area
  | "requester"; // the ticket owner

/** Side effect on the assignee column when the transition is applied. */
export type AssigneeEffect = "assign" | "unassign" | null;

export interface Transition {
  from: TicketStatus;
  to: TicketStatus;
  actor: TransitionActor;
  /** True when the actor must provide a short reason (motivo / nota). */
  requiresReason: boolean;
  assigneeEffect: AssigneeEffect;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: "open", to: "in_progress", actor: "area_agent", requiresReason: false, assigneeEffect: "assign" },
  { from: "in_progress", to: "open", actor: "assignee_or_supervisor", requiresReason: false, assigneeEffect: "unassign" },
  { from: "in_progress", to: "waiting", actor: "assignee", requiresReason: true, assigneeEffect: null },
  { from: "waiting", to: "in_progress", actor: "assignee", requiresReason: false, assigneeEffect: null },
  { from: "in_progress", to: "resolved", actor: "assignee", requiresReason: true, assigneeEffect: null },
  { from: "resolved", to: "closed", actor: "requester", requiresReason: false, assigneeEffect: null },
  { from: "resolved", to: "in_progress", actor: "requester", requiresReason: true, assigneeEffect: null },
  { from: "open", to: "cancelled", actor: "requester", requiresReason: false, assigneeEffect: null },
];

export const TERMINAL_STATUSES: readonly TicketStatus[] = ["closed", "cancelled"];

export function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function findTransition(
  from: TicketStatus,
  to: TicketStatus,
): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return findTransition(from, to) !== undefined;
}

export function transitionsFrom(from: TicketStatus): readonly Transition[] {
  return TRANSITIONS.filter((t) => t.from === from);
}

export type TransitionError =
  | "invalid_transition"
  | "reason_required";

export type TransitionValidation =
  | { ok: true; transition: Transition }
  | { ok: false; error: TransitionError };

/**
 * Validates a requested status change without applying it.
 * Whitespace-only reasons count as missing.
 */
export function validateTransition(input: {
  from: TicketStatus;
  to: TicketStatus;
  reason?: string | null;
}): TransitionValidation {
  const transition = findTransition(input.from, input.to);
  if (!transition) return { ok: false, error: "invalid_transition" };
  if (transition.requiresReason && !(input.reason ?? "").trim()) {
    return { ok: false, error: "reason_required" };
  }
  return { ok: true, transition };
}
