import "server-only";
import { computeSla, resolveTargets, type SlaEvent, type SlaResult } from "@/domain/sla";
import type { Priority } from "@/domain/types";
import { listEventsForTickets, listSlaPolicies, type TicketEventView, type TicketView } from "@/lib/db/tickets";

export interface TicketWithSla extends TicketView {
  sla: SlaResult;
}

function toSlaEvent(e: TicketEventView): SlaEvent {
  const p = e.payload as { priority?: Priority; from?: Priority; to?: Priority };
  return {
    type: e.type,
    fromStatus: e.fromStatus as SlaEvent["fromStatus"],
    toStatus: e.toStatus as SlaEvent["toStatus"],
    payload: { priority: p.priority, from: p.from, to: p.to },
    createdAt: new Date(e.createdAt),
  };
}

/** Computes the SLA of every ticket with one events query and one policies query. */
export async function attachSla(tickets: TicketView[], now = new Date()): Promise<TicketWithSla[]> {
  if (tickets.length === 0) return [];
  const [policies, eventsByTicket] = await Promise.all([
    listSlaPolicies(),
    listEventsForTickets(tickets.map((t) => t.id)),
  ]);
  const targetsByArea = new Map<string, ReturnType<typeof resolveTargets>>();
  return tickets.map((t) => {
    let targets = targetsByArea.get(t.areaId);
    if (!targets) {
      targets = resolveTargets(policies, t.areaId);
      targetsByArea.set(t.areaId, targets);
    }
    const sla = computeSla({
      createdAt: new Date(t.createdAt),
      status: t.status,
      initialPriority: t.priority,
      events: (eventsByTicket.get(t.id) ?? []).map(toSlaEvent),
      targets,
      now,
    });
    return { ...t, sla };
  });
}

/** SLA of one ticket whose events are already loaded (detail page). */
export async function slaForTicket(ticket: TicketView, events: TicketEventView[], now = new Date()): Promise<SlaResult> {
  const policies = await listSlaPolicies();
  return computeSla({
    createdAt: new Date(ticket.createdAt),
    status: ticket.status,
    initialPriority: ticket.priority,
    events: events.map(toSlaEvent),
    targets: resolveTargets(policies, ticket.areaId),
    now,
  });
}
