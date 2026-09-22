import { notFound } from "next/navigation";
import { TicketTable } from "@/components/TicketTable";
import { can } from "@/domain/permissions";
import { sortQueue } from "@/domain/queue";
import { listQueue } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";

export default async function QueuePage() {
  const user = await requireSessionUser();
  if (!can(user, "queue.view")) notFound();

  const tickets = sortQueue(await listQueue(user.areaId));
  const allAreas = user.areaId === null;
  const unassigned = tickets.filter((t) => t.assigneeId === null).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Cola {allAreas ? "de todas las áreas" : `de ${user.areaName}`}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {tickets.length} tickets activos, {unassigned} sin dueño. Primero los que nadie tiene, luego por prioridad y antigüedad. Los resueltos esperan al solicitante.
      </p>
      <TicketTable
        tickets={tickets}
        columns={allAreas
          ? ["code", "title", "area", "location", "priority", "status", "assignee", "created"]
          : ["code", "title", "category", "location", "priority", "status", "assignee", "created"]}
        empty="No hay tickets activos en la cola."
      />
    </div>
  );
}
