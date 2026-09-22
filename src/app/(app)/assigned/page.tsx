import { notFound } from "next/navigation";
import { TicketTable } from "@/components/TicketTable";
import { can } from "@/domain/permissions";
import { sortQueue } from "@/domain/queue";
import { listTicketsByAssignee } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";
import { attachSla } from "@/lib/sla";

export default async function AssignedPage() {
  const user = await requireSessionUser();
  // "Mis asignados" only makes sense for someone who can be an assignee. The
  // BRIEF's action list has no `assigned.view`, so the gate is the ability to
  // take tickets (agents). See DECISIONS.md for the trade-off.
  if (!can(user, "ticket.take")) notFound();

  const withSla = await attachSla(await listTicketsByAssignee(user.id));
  const tickets = sortQueue(withSla.map((t) => ({ ...t, slaRatio: t.sla.ratio })));

  return (
    <div>
      <h1 className="text-xl font-semibold">Mis asignados</h1>
      <p className="mt-1 text-sm text-gray-600">Tickets que tienes en curso, en espera o resueltos sin confirmar.</p>
      <TicketTable
        tickets={tickets}
        columns={["code", "title", "category", "location", "priority", "status", "sla", "deadline", "created"]}
        empty="No tienes tickets asignados."
      />
    </div>
  );
}
