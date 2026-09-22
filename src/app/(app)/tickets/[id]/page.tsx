import { notFound } from "next/navigation";
import { z } from "zod";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { allowedTransitions, can } from "@/domain/permissions";
import { getTicketById, listTicketEvents } from "@/lib/db/tickets";
import { formatDateTime } from "@/lib/format";
import { requireSessionUser } from "@/lib/session";
import { TicketActions } from "./TicketActions";
import { Timeline } from "./Timeline";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const ticket = await getTicketById(id);
  // Same 404 for "does not exist" and "not yours": no information leak.
  if (!ticket || !can(user, "ticket.view", ticket)) notFound();

  const events = await listTicketEvents(ticket.id);
  const transitions = allowedTransitions(user, ticket);

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <section>
        <p className="font-mono text-sm text-gray-500">{ticket.code}</p>
        <h1 className="text-xl font-semibold">{ticket.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-500">Categoría</dt><dd>{ticket.categoryName}</dd></div>
          <div><dt className="text-gray-500">Área</dt><dd>{ticket.areaName}</dd></div>
          <div><dt className="text-gray-500">Ubicación</dt><dd>{ticket.locationName}</dd></div>
          <div><dt className="text-gray-500">Solicitante</dt><dd>{ticket.requesterName}</dd></div>
          <div><dt className="text-gray-500">Asignado a</dt><dd>{ticket.assigneeName ?? "Nadie"}</dd></div>
          <div><dt className="text-gray-500">Creado</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div>
        </dl>

        <h2 className="mt-6 text-sm font-medium text-gray-500">Descripción</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.description}</p>

        <h2 className="mt-8 text-lg font-medium">Línea de tiempo</h2>
        <Timeline events={events} />
      </section>

      <aside>
        <h2 className="text-lg font-medium">Acciones</h2>
        <TicketActions ticketId={ticket.id} transitions={transitions} />
      </aside>
    </div>
  );
}
