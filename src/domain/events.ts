/**
 * Ticket events: payload schemas per event type and the pure mapping from a
 * transition to the event it emits. The event log is the source for the
 * timeline today and for SLA and metrics later.
 */
import { z } from "zod";
import type { Transition } from "./stateMachine";
import { PRIORITIES, type EventType } from "./types";

export const createdPayloadSchema = z.object({
  priority: z.enum(PRIORITIES),
  priority_source: z.literal("category_default"),
});

export const takenPayloadSchema = z.object({
  assignee_id: z.string(),
});

export const releasedPayloadSchema = z.object({
  assignee_id: z.string(),
  reason: z.string().optional(),
});

export const statusChangedPayloadSchema = z.object({
  reason: z.string().optional(),
});

export const priorityChangedPayloadSchema = z.object({
  from: z.enum(PRIORITIES),
  to: z.enum(PRIORITIES),
  reason: z.string(),
});

export const EVENT_PAYLOAD_SCHEMAS = {
  created: createdPayloadSchema,
  taken: takenPayloadSchema,
  released: releasedPayloadSchema,
  status_changed: statusChangedPayloadSchema,
  priority_changed: priorityChangedPayloadSchema,
} as const satisfies Record<EventType, z.ZodTypeAny>;

export type EventPayload = {
  [K in EventType]: z.infer<(typeof EVENT_PAYLOAD_SCHEMAS)[K]>;
};

/** Validates a payload against the schema of its event type. */
export function parseEventPayload<T extends EventType>(type: T, payload: unknown): EventPayload[T] {
  return EVENT_PAYLOAD_SCHEMAS[type].parse(payload) as EventPayload[T];
}

export type TransitionEvent =
  | { type: "taken"; payload: EventPayload["taken"] }
  | { type: "released"; payload: EventPayload["released"] }
  | { type: "status_changed"; payload: EventPayload["status_changed"] };

/**
 * Which event a transition produces. Taking and releasing have their own
 * event types; every other status change is `status_changed`.
 * The reason, when present, is trimmed and stored on the payload.
 */
export function buildTransitionEvent(
  transition: Transition,
  input: { actorId: string; currentAssigneeId: string | null; reason?: string | null },
): TransitionEvent {
  const reason = input.reason?.trim() || undefined;

  if (transition.assigneeEffect === "assign") {
    return { type: "taken", payload: { assignee_id: input.actorId } };
  }
  if (transition.assigneeEffect === "unassign") {
    if (!input.currentAssigneeId) {
      throw new Error("Cannot release a ticket without an assignee");
    }
    return {
      type: "released",
      payload: { assignee_id: input.currentAssigneeId, ...(reason ? { reason } : {}) },
    };
  }
  return { type: "status_changed", payload: reason ? { reason } : {} };
}
