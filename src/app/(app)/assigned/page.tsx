import { notFound } from "next/navigation";
import { TicketTable } from "@/components/TicketTable";
import { can } from "@/domain/permissions";
import { sortQueue } from "@/domain/queue";
import { listTicketsByAssignee } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";

export default async function AssignedPage() {
  const user = await requireSessionUser();
  if (!can(user, "ticket.take")) notFound();

  const tickets = sortQueue(await listTicketsByAssignee(user.id));

  return (
    <div>
      <h1 className="text-xl font-semibold">Mis asignados</h1>
      <p className="mt-1 text-sm text-gray-600">Tickets que tienes en curso, en espera o resueltos sin confirmar.</p>
      <TicketTable
        tickets={tickets}
        columns={["code", "title", "category", "location", "priority", "status", "created"]}
        empty="No tienes tickets asignados."
      />
    </div>
  );
}
