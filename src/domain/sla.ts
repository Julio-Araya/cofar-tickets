/**
 * SLA (BRIEF §9), computed from the event log. Pure: no I/O, no Date.now().
 *
 * Rules:
 * - Consumed time runs from creation until the last resolution (or `now` if
 *   the ticket is still active), minus the stretches spent in `waiting`.
 * - The target depends on priority. Priority can change mid-life, so time is
 *   accumulated per priority segment, each against its own target:
 *     ratio = Σ activeHours(segment) / targetHours(segment.priority)
 *   The SLA is breached when ratio reaches 1. Changing the priority never
 *   rewrites hours that already ran under another target.
 * - The stretch between resolved and reopened counts (the problem was not solved).
 * - Cancelled tickets have no SLA.
 */
import type { Priority, TicketStatus } from "./types";

export interface SlaPolicy {
  priority: Priority;
  areaId: string | null;
  resolutionHours: number;
}

export type SlaTargets = Record<Priority, number>;

/** Area policy wins over the default (areaId null). Throws if a priority has no policy at all. */
export function resolveTargets(policies: readonly SlaPolicy[], areaId: string): SlaTargets {
  const pick = (priority: Priority): number => {
    const forArea = policies.find((p) => p.priority === priority && p.areaId === areaId);
    const fallback = policies.find((p) => p.priority === priority && p.areaId === null);
    const chosen = forArea ?? fallback;
    if (!chosen) throw new Error(`No SLA policy for priority ${priority}`);
    return chosen.resolutionHours;
  };
  return { high: pick("high"), medium: pick("medium"), low: pick("low") };
}

/** The slice of an event the SLA needs. */
export interface SlaEvent {
  type: "created" | "taken" | "released" | "status_changed" | "priority_changed";
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus | null;
  /** For priority_changed: { from, to }. For created: { priority }. */
  payload: { priority?: Priority; from?: Priority; to?: Priority };
  createdAt: Date;
}

export type SlaState = "on_track" | "at_risk" | "breached";

export interface SlaResult {
  /** false for cancelled tickets: every other field is zero/null. */
  applicable: boolean;
  state: SlaState;
  /** Σ active / target over the segments. 1 = exactly on the limit. */
  ratio: number;
  /** Hours that counted against the SLA. */
  activeHours: number;
  /** Hours discounted while waiting on the requester. */
  waitingHours: number;
  /** true when the clock stopped (resolved or closed). */
  stopped: boolean;
  /** true when the clock is paused right now (status waiting). */
  paused: boolean;
  /**
   * When the SLA reaches or reached ratio 1. Null when the ticket stopped
   * within target, or when paused (the deadline moves while waiting).
   */
  deadline: Date | null;
  /** Target of the priority in force at the end of the computed window. */
  currentTargetHours: number;
  /** When the clock stopped (last resolution). Null while running. */
  stoppedAt: Date | null;
}

export const AT_RISK_THRESHOLD = 0.75;

const HOUR_MS = 3_600_000;

export interface SlaInput {
  createdAt: Date;
  status: TicketStatus;
  /** Priority at creation; used only if there is no `created` event carrying it. */
  initialPriority: Priority;
  events: readonly SlaEvent[];
  targets: SlaTargets;
  now: Date;
}

export function stateFor(ratio: number, stopped: boolean): SlaState {
  if (ratio >= 1) return "breached";
  if (!stopped && ratio >= AT_RISK_THRESHOLD) return "at_risk";
  return "on_track";
}

export function computeSla(input: SlaInput): SlaResult {
  const { targets, now } = input;
  const notApplicable: SlaResult = {
    applicable: false,
    state: "on_track",
    ratio: 0,
    activeHours: 0,
    waitingHours: 0,
    stopped: true,
    paused: false,
    deadline: null,
    currentTargetHours: targets[input.initialPriority],
    stoppedAt: null,
  };
  if (input.status === "cancelled") return notApplicable;

  const events = [...input.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const stopped = input.status === "resolved" || input.status === "closed";

  // The clock stops at the last transition into resolved.
  let stopAt = now;
  if (stopped) {
    const lastResolved = [...events].reverse().find((e) => e.toStatus === "resolved");
    stopAt = lastResolved ? lastResolved.createdAt : now;
  }

  let priority: Priority =
    events.find((e) => e.type === "created")?.payload.priority ?? input.initialPriority;
  let waiting = false;
  let cursor = input.createdAt;
  let ratio = 0;
  let activeMs = 0;
  let waitingMs = 0;
  let deadline: Date | null = null;

  const advance = (to: Date) => {
    const ms = Math.max(0, to.getTime() - cursor.getTime());
    if (ms > 0) {
      if (waiting) {
        waitingMs += ms;
      } else {
        const target = targets[priority] * HOUR_MS;
        const before = ratio;
        ratio += ms / target;
        activeMs += ms;
        if (deadline === null && before < 1 && ratio >= 1) {
          deadline = new Date(cursor.getTime() + (1 - before) * target);
        }
      }
    }
    cursor = to;
  };

  for (const e of events) {
    if (e.createdAt.getTime() > stopAt.getTime()) break;
    if (e.createdAt.getTime() < input.createdAt.getTime()) continue;
    advance(e.createdAt);
    if (e.toStatus === "waiting") waiting = true;
    else if (e.fromStatus === "waiting" && e.toStatus !== null) waiting = false;
    if (e.type === "priority_changed" && e.payload.to) priority = e.payload.to;
  }
  advance(stopAt);

  const paused = !stopped && waiting;
  if (deadline === null && !stopped && !paused) {
    deadline = new Date(cursor.getTime() + (1 - ratio) * targets[priority] * HOUR_MS);
  }

  return {
    applicable: true,
    state: stateFor(ratio, stopped),
    ratio,
    activeHours: activeMs / HOUR_MS,
    waitingHours: waitingMs / HOUR_MS,
    stopped,
    paused,
    deadline,
    currentTargetHours: targets[priority],
    stoppedAt: stopped ? stopAt : null,
  };
}
