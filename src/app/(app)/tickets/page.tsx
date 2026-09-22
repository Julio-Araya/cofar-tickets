import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import { listTicketsByRequester } from "@/lib/db/tickets";
import { formatDateTime } from "@/lib/format";
import { requireSessionUser } from "@/lib/session";

export default async function MyTicketsPage() {
  const user = await requireSessionUser();
  const tickets = await listTicketsByRequester(user.id);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mis tickets</h1>
        <Link href="/tickets/new" className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
          Nuevo ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">Aún no has creado tickets.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-3">Código</th>
              <th className="py-2 pr-3">Título</th>
              <th className="py-2 pr-3">Categoría</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Prioridad</th>
              <th className="py-2 pr-3">Creado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-gray-200">
                <td className="py-2 pr-3 font-mono">
                  <Link href={`/tickets/${t.id}`} className="hover:underline">{t.code}</Link>
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/tickets/${t.id}`} className="hover:underline">{t.title}</Link>
                </td>
                <td className="py-2 pr-3 text-gray-600">{t.categoryName}</td>
                <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                <td className="py-2 pr-3"><PriorityBadge priority={t.priority} /></td>
                <td className="py-2 pr-3 text-gray-600">{formatDateTime(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
