/**
 * Domain types. Pure TypeScript: no Next.js, no Supabase.
 * These mirror the Postgres enums in supabase/migrations.
 */

export const ROLES = ["requester", "agent", "supervisor"] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EVENT_TYPES = [
  "created",
  "taken",
  "released",
  "status_changed",
  "priority_changed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const LOCATION_TYPES = ["office", "pharmacy", "warehouse"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const TICKET_SOURCES = ["web"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

/** The minimum a domain rule needs to know about who is acting. */
export interface DomainUser {
  id: string;
  role: Role;
  /** null for a supervisor with access to every area. */
  areaId: string | null;
}

/** The minimum a domain rule needs to know about a ticket. */
export interface DomainTicket {
  id: string;
  status: TicketStatus;
  priority: Priority;
  areaId: string;
  requesterId: string;
  assigneeId: string | null;
}
