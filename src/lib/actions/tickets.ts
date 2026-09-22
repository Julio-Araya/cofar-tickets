"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, actionForTransition } from "@/domain/permissions";
import { validateTransition } from "@/domain/stateMachine";
import { buildTransitionEvent } from "@/domain/events";
import { TICKET_STATUSES } from "@/domain/types";
import { requireSessionUser } from "@/lib/session";
import {
  TicketStateConflictError,
  getTicketById,
  rpcApplyTransition,
  rpcCreateTicket,
} from "@/lib/db/tickets";

export type ActionState = { error?: string; fieldErrors?: Record<string, string> };

const STALE_MESSAGE = "El ticket cambió mientras lo veías. Revisa su estado actual.";

const createTicketSchema = z.object({
  title: z.string().trim().min(5, "El título debe tener al menos 5 caracteres").max(200, "Máximo 200 caracteres"),
  description: z
    .string()
    .trim()
    .min(10, "Describe el problema con al menos 10 caracteres")
    .max(5000, "Máximo 5000 caracteres"),
  categoryId: z.uuid("Elige una categoría"),
});

export async function createTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireSessionUser();
  if (!can(user, "ticket.create")) return { error: "No tienes permiso para crear tickets." };

  const parsed = createTicketSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { id } = await rpcCreateTicket({ requesterId: user.id, ...parsed.data });
  revalidatePath("/tickets");
  redirect(`/tickets/${id}`);
}

const transitionSchema = z.object({
  ticketId: z.uuid(),
  /** Status the user saw when they clicked. Detects stale pages before hitting the RPC guard. */
  from: z.enum(TICKET_STATUSES),
  to: z.enum(TICKET_STATUSES),
  reason: z.string().trim().max(1000, "Máximo 1000 caracteres").optional(),
});

export async function transitionTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireSessionUser();

  const parsed = transitionSchema.safeParse({
    ticketId: formData.get("ticketId"),
    from: formData.get("from"),
    to: formData.get("to"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { error: "Datos inválidos." };
  const { ticketId, from, to, reason } = parsed.data;

  const ticket = await getTicketById(ticketId);
  if (!ticket || !can(user, "ticket.view", ticket)) return { error: "El ticket no existe." };

  if (ticket.status !== from) {
    revalidatePath(`/tickets/${ticket.id}`);
    return { error: STALE_MESSAGE };
  }

  const validation = validateTransition({ from: ticket.status, to, reason });
  if (!validation.ok) {
    return validation.error === "reason_required"
      ? { error: "Escribe un motivo." }
      : { error: "Ese cambio no es válido para el estado actual del ticket." };
  }
  const { transition } = validation;

  if (!can(user, actionForTransition(transition), ticket)) {
    return { error: "No tienes permiso para hacer este cambio." };
  }

  const event = buildTransitionEvent(transition, {
    actorId: user.id,
    currentAssigneeId: ticket.assigneeId,
    reason,
  });

  try {
    await rpcApplyTransition({
      ticketId: ticket.id,
      actorId: user.id,
      expectedStatus: ticket.status,
      toStatus: transition.to,
      eventType: event.type,
      assigneeEffect: transition.assigneeEffect,
      payload: event.payload,
    });
  } catch (e) {
    if (e instanceof TicketStateConflictError) {
      revalidatePath(`/tickets/${ticket.id}`);
      return { error: STALE_MESSAGE };
    }
    throw e;
  }

  revalidatePath(`/tickets/${ticket.id}`);
  revalidatePath("/tickets");
  return {};
}
