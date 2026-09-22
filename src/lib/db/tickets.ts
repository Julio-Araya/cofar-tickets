import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  EVENT_TYPES,
  PRIORITIES,
  TICKET_STATUSES,
  type DomainTicket,
  type EventType,
  type Priority,
} from "@/domain/types";
import type { AssigneeEffect } from "@/domain/stateMachine";
import { parseEventPayload } from "@/domain/events";
import type { SlaPolicy } from "@/domain/sla";

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
const named = z.object({ name: z.string() });

const ticketRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  category_id: z.uuid(),
  area_id: z.uuid(),
  location_id: z.uuid(),
  requester_id: z.uuid(),
  assignee_id: z.uuid().nullable(),
  status: z.enum(TICKET_STATUSES),
  priority: z.enum(PRIORITIES),
  created_at: z.string(),
  updated_at: z.string(),
  resolved_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  category: named.nullable(),
  area: named.nullable(),
  location: named.nullable(),
  requester: named.nullable(),
  assignee: named.nullable(),
});

const TICKET_SELECT = `id, code, title, description, category_id, area_id, location_id, requester_id, assignee_id,
  status, priority, created_at, updated_at, resolved_at, closed_at,
  category:categories(name), area:areas(name), location:locations(name),
  requester:users!tickets_requester_id_fkey(name), assignee:users!tickets_assignee_id_fkey(name)`;

export interface TicketView extends DomainTicket {
  code: string;
  title: string;
  description: string;
  categoryName: string;
  areaName: string;
  locationName: string;
  requesterName: string;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

function toTicketView(row: unknown): TicketView {
  const r = ticketRowSchema.parse(row);
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    areaId: r.area_id,
    requesterId: r.requester_id,
    assigneeId: r.assignee_id,
    categoryName: r.category?.name ?? "",
    areaName: r.area?.name ?? "",
    locationName: r.location?.name ?? "",
    requesterName: r.requester?.name ?? "",
    assigneeName: r.assignee?.name ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    closedAt: r.closed_at,
  };
}

const eventRowSchema = z.object({
  id: z.uuid(),
  ticket_id: z.uuid(),
  actor_id: z.uuid(),
  type: z.enum(EVENT_TYPES),
  from_status: z.enum(TICKET_STATUSES).nullable(),
  to_status: z.enum(TICKET_STATUSES).nullable(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  actor: named.nullable(),
});

export interface TicketEventView {
  id: string;
  type: EventType;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  actorName: string;
}

const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  default_priority: z.enum(PRIORITIES),
  area: named.nullable(),
});

export interface CategoryOption {
  id: string;
  name: string;
  defaultPriority: (typeof PRIORITIES)[number];
  areaName: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listTicketsByRequester(requesterId: string): Promise<TicketView[]> {
  const { data, error } = await supabaseAdmin()
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("requester_id", requesterId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTicketsByRequester: ${error.message}`);
  return data.map(toTicketView);
}

const ACTIVE_STATUSES = ["open", "in_progress", "waiting", "resolved"] as const;

/** Non-terminal tickets of one area, or of every area when areaId is null (supervisor of all). */
export async function listQueue(areaId: string | null): Promise<TicketView[]> {
  let query = supabaseAdmin()
    .from("tickets")
    .select(TICKET_SELECT)
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: true });
  if (areaId) query = query.eq("area_id", areaId);
  const { data, error } = await query;
  if (error) throw new Error(`listQueue: ${error.message}`);
  return data.map(toTicketView);
}

export async function listTicketsByAssignee(assigneeId: string): Promise<TicketView[]> {
  const { data, error } = await supabaseAdmin()
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("assignee_id", assigneeId)
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTicketsByAssignee: ${error.message}`);
  return data.map(toTicketView);
}

export async function getTicketById(id: string): Promise<TicketView | null> {
  const { data, error } = await supabaseAdmin()
    .from("tickets")
    .select(TICKET_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTicketById: ${error.message}`);
  return data ? toTicketView(data) : null;
}

const EVENT_SELECT = "id, ticket_id, actor_id, type, from_status, to_status, payload, created_at, actor:users(name)";

/** Validates the row and its payload against the schema of its event type. A corrupt event fails loudly. */
function toEventView(row: unknown): TicketEventView & { ticketId: string } {
  const r = eventRowSchema.parse(row);
  return {
    id: r.id,
    ticketId: r.ticket_id,
    type: r.type,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    payload: parseEventPayload(r.type, r.payload),
    createdAt: r.created_at,
    actorName: r.actor?.name ?? "",
  };
}

export async function listTicketEvents(ticketId: string): Promise<TicketEventView[]> {
  const { data, error } = await supabaseAdmin()
    .from("ticket_events")
    .select(EVENT_SELECT)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTicketEvents: ${error.message}`);
  return data.map(toEventView);
}

/** Events of many tickets in one query, grouped by ticket id, oldest first. */
export async function listEventsForTickets(ticketIds: readonly string[]): Promise<Map<string, TicketEventView[]>> {
  const byTicket = new Map<string, TicketEventView[]>();
  if (ticketIds.length === 0) return byTicket;
  const { data, error } = await supabaseAdmin()
    .from("ticket_events")
    .select(EVENT_SELECT)
    .in("ticket_id", [...ticketIds])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listEventsForTickets: ${error.message}`);
  for (const row of data) {
    const e = toEventView(row);
    const list = byTicket.get(e.ticketId) ?? [];
    list.push(e);
    byTicket.set(e.ticketId, list);
  }
  return byTicket;
}

const policyRowSchema = z.object({
  priority: z.enum(PRIORITIES),
  area_id: z.uuid().nullable(),
  resolution_hours: z.number().int().positive(),
});

export async function listSlaPolicies(): Promise<SlaPolicy[]> {
  const { data, error } = await supabaseAdmin().from("sla_policies").select("priority, area_id, resolution_hours");
  if (error) throw new Error(`listSlaPolicies: ${error.message}`);
  return data.map((row) => {
    const r = policyRowSchema.parse(row);
    return { priority: r.priority, areaId: r.area_id, resolutionHours: r.resolution_hours };
  });
}

/** Every non-cancelled ticket of the scope: active ones plus history for the 30-day metrics. */
export async function listTicketsForDashboard(areaId: string | null): Promise<TicketView[]> {
  let query = supabaseAdmin().from("tickets").select(TICKET_SELECT).neq("status", "cancelled");
  if (areaId) query = query.eq("area_id", areaId);
  const { data, error } = await query;
  if (error) throw new Error(`listTicketsForDashboard: ${error.message}`);
  return data.map(toTicketView);
}

export async function listActiveCategories(): Promise<CategoryOption[]> {
  const { data, error } = await supabaseAdmin()
    .from("categories")
    .select("id, name, default_priority, area:areas(name)")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`listActiveCategories: ${error.message}`);
  return data.map((row) => {
    const r = categoryRowSchema.parse(row);
    return { id: r.id, name: r.name, defaultPriority: r.default_priority, areaName: r.area?.name ?? "" };
  });
}

// ---------------------------------------------------------------------------
// Writes: always through the RPCs (ticket + event in one transaction)
// ---------------------------------------------------------------------------
export class TicketStateConflictError extends Error {
  constructor() {
    super("ticket_state_conflict");
    this.name = "TicketStateConflictError";
  }
}

const rpcTicketSchema = z.object({ id: z.uuid() });

export async function rpcCreateTicket(input: {
  requesterId: string;
  title: string;
  description: string;
  categoryId: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin().rpc("create_ticket", {
    p_requester_id: input.requesterId,
    p_title: input.title,
    p_description: input.description,
    p_category_id: input.categoryId,
  });
  if (error) throw new Error(`create_ticket: ${error.message}`);
  return rpcTicketSchema.parse(data);
}

export async function rpcApplyTransition(input: {
  ticketId: string;
  actorId: string;
  expectedStatus: DomainTicket["status"];
  toStatus: DomainTicket["status"];
  eventType: EventType;
  assigneeEffect: AssigneeEffect;
  payload: Record<string, unknown>;
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin().rpc("apply_ticket_transition", {
    p_ticket_id: input.ticketId,
    p_actor_id: input.actorId,
    p_expected_status: input.expectedStatus,
    p_to_status: input.toStatus,
    p_event_type: input.eventType,
    p_assignee_effect: input.assigneeEffect,
    p_payload: input.payload,
  });
  if (error) {
    if (error.message.includes("ticket_state_conflict")) throw new TicketStateConflictError();
    throw new Error(`apply_ticket_transition: ${error.message}`);
  }
  return rpcTicketSchema.parse(data);
}

export async function rpcChangePriority(input: {
  ticketId: string;
  actorId: string;
  expectedPriority: Priority;
  newPriority: Priority;
  reason: string;
}): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin().rpc("change_ticket_priority", {
    p_ticket_id: input.ticketId,
    p_actor_id: input.actorId,
    p_expected_priority: input.expectedPriority,
    p_new_priority: input.newPriority,
    p_reason: input.reason,
  });
  if (error) {
    if (error.message.includes("ticket_state_conflict")) throw new TicketStateConflictError();
    throw new Error(`change_ticket_priority: ${error.message}`);
  }
  return rpcTicketSchema.parse(data);
}
