/**
 * Authorization. One map says which actions each role has; `can()` adds the
 * relationship to the ticket (owner, assignee, same area) and the ticket
 * status, so UI and server ask the same question.
 *
 * Adding a role = adding an entry to ROLE_ACTIONS. Screens do not change.
 */
import { transitionsFrom, type Transition, type TransitionActor } from "./stateMachine";
import type { DomainTicket, DomainUser, Role, TicketStatus } from "./types";

export const ACTIONS = [
  "ticket.create",
  "ticket.view",
  "queue.view",
  "ticket.take",
  "ticket.release",
  "ticket.transition",
  "ticket.set_priority",
  "ticket.confirm",
  "ticket.reopen",
  "ticket.cancel",
  "dashboard.view",
] as const;
export type Action = (typeof ACTIONS)[number];

/** Actions every role has because every role can open tickets of its own. */
const OWNER_ACTIONS: readonly Action[] = [
  "ticket.create",
  "ticket.view",
  "ticket.confirm",
  "ticket.reopen",
  "ticket.cancel",
];

export const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  requester: [...OWNER_ACTIONS],
  agent: [
    ...OWNER_ACTIONS,
    "queue.view",
    "ticket.take",
    "ticket.release",
    "ticket.transition",
    "ticket.set_priority",
  ],
  supervisor: [
    ...OWNER_ACTIONS,
    "queue.view",
    "ticket.release",
    "ticket.set_priority",
    "dashboard.view",
  ],
};

/** Statuses in which priority still drives the SLA clock. */
export const PRIORITY_EDITABLE_STATUSES: readonly TicketStatus[] = [
  "open",
  "in_progress",
  "waiting",
];

function roleHas(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

function isOwner(user: DomainUser, ticket: DomainTicket): boolean {
  return ticket.requesterId === user.id;
}

function isAssignee(user: DomainUser, ticket: DomainTicket): boolean {
  return ticket.assigneeId !== null && ticket.assigneeId === user.id;
}

function isAreaAgent(user: DomainUser, ticket: DomainTicket): boolean {
  return user.role === "agent" && user.areaId === ticket.areaId;
}

/** A supervisor covers a ticket's area when its area matches or it has no area (all areas). */
function supervisesArea(user: DomainUser, areaId: string): boolean {
  return user.role === "supervisor" && (user.areaId === null || user.areaId === areaId);
}

/** Does this user satisfy the relationship the transition asks for? */
export function matchesActor(
  user: DomainUser,
  ticket: DomainTicket,
  actor: TransitionActor,
): boolean {
  switch (actor) {
    case "area_agent":
      return isAreaAgent(user, ticket);
    case "assignee":
      return isAssignee(user, ticket);
    case "assignee_or_supervisor":
      return isAssignee(user, ticket) || supervisesArea(user, ticket.areaId);
    case "requester":
      return isOwner(user, ticket);
  }
}

/**
 * Transitions this user may apply to this ticket right now, filtered by both
 * the state machine and the role map.
 */
export function allowedTransitions(
  user: DomainUser,
  ticket: DomainTicket,
): Transition[] {
  return transitionsFrom(ticket.status).filter((t) => {
    if (!matchesActor(user, ticket, t.actor)) return false;
    return roleHas(user.role, actionForTransition(t));
  });
}

/** Maps a transition of the graph to the action name that authorizes it. */
export function actionForTransition(t: Transition): Action {
  if (t.from === "open" && t.to === "in_progress") return "ticket.take";
  if (t.from === "in_progress" && t.to === "open") return "ticket.release";
  if (t.from === "resolved" && t.to === "closed") return "ticket.confirm";
  if (t.from === "resolved" && t.to === "in_progress") return "ticket.reopen";
  if (t.from === "open" && t.to === "cancelled") return "ticket.cancel";
  return "ticket.transition";
}

/**
 * `can(user, action)` answers at role level (useful for navigation).
 * `can(user, action, ticket)` also checks ownership, assignment, area and status.
 */
export function can(user: DomainUser, action: Action, ticket?: DomainTicket): boolean {
  if (!roleHas(user.role, action)) return false;
  if (!ticket) return true;

  switch (action) {
    case "ticket.create":
    case "queue.view":
    case "dashboard.view":
      return true;

    case "ticket.view":
      return (
        isOwner(user, ticket) ||
        isAreaAgent(user, ticket) ||
        supervisesArea(user, ticket.areaId)
      );

    case "ticket.set_priority":
      return (
        PRIORITY_EDITABLE_STATUSES.includes(ticket.status) &&
        (isAreaAgent(user, ticket) || supervisesArea(user, ticket.areaId))
      );

    case "ticket.take":
    case "ticket.release":
    case "ticket.transition":
    case "ticket.confirm":
    case "ticket.reopen":
    case "ticket.cancel":
      return allowedTransitions(user, ticket).some(
        (t) => actionForTransition(t) === action,
      );
  }
}
