import { notFound } from "next/navigation";
import { TicketTable } from "@/components/TicketTable";
import { can } from "@/domain/permissions";
import { sortQueue } from "@/domain/queue";
import { listQueue } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";
import { attachSla } from "@/lib/sla";

export default async function QueuePage() {
  const user = await requireSessionUser();
  if (!can(user, "queue.view")) notFound();

  const withSla = await attachSla(await listQueue(user.areaId));
  const tickets = sortQueue(withSla.map((t) => ({ ...t, slaRatio: t.sla.ratio })));
  const allAreas = user.areaId === null;
  const unassigned = tickets.filter((t) => t.assigneeId === null).length;

  return (
    <div>
      <h1 className="text-xl font-semibold">Cola {allAreas ? "de todas las áreas" : `de ${user.areaName}`}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {tickets.length} tickets activos, {unassigned} sin dueño. Primero los que nadie tiene, luego por SLA más comprometido. Los resueltos esperan al solicitante.
      </p>
      <TicketTable
        tickets={tickets}
        columns={allAreas
          ? ["code", "title", "area", "location", "priority", "status", "sla", "deadline", "assignee"]
          : ["code", "title", "category", "location", "priority", "status", "sla", "deadline", "assignee"]}
        empty="No hay tickets activos en la cola."
      />
    </div>
  );
}
