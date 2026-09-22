import Link from "next/link";
import { TicketTable } from "@/components/TicketTable";
import { listTicketsByRequester } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";
import { attachSla } from "@/lib/sla";

export default async function MyTicketsPage() {
  const user = await requireSessionUser();
  const tickets = await attachSla(await listTicketsByRequester(user.id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis tickets</h1>
        <Link href="/tickets/new" className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
          Nuevo ticket
        </Link>
      </div>
      <TicketTable
        tickets={tickets}
        columns={["code", "title", "category", "status", "priority", "sla", "deadline", "created"]}
        empty="Aún no has creado tickets."
      />
    </div>
  );
}
