import Link from "next/link";
import { PriorityBadge, StatusBadge } from "@/components/Badges";
import type { TicketView } from "@/lib/db/tickets";
import { formatDateTime } from "@/lib/format";

type Column = "code" | "title" | "category" | "location" | "area" | "status" | "priority" | "assignee" | "created";

const HEADERS: Record<Column, string> = {
  code: "Código",
  title: "Título",
  category: "Categoría",
  location: "Ubicación",
  area: "Área",
  status: "Estado",
  priority: "Prioridad",
  assignee: "Asignado a",
  created: "Creado",
};

function cell(t: TicketView, col: Column) {
  switch (col) {
    case "code":
      return <Link href={`/tickets/${t.id}`} className="font-mono hover:underline">{t.code}</Link>;
    case "title":
      return <Link href={`/tickets/${t.id}`} className="hover:underline">{t.title}</Link>;
    case "category":
      return <span className="text-gray-600">{t.categoryName}</span>;
    case "location":
      return t.locationName;
    case "area":
      return <span className="text-gray-600">{t.areaName}</span>;
    case "status":
      return <StatusBadge status={t.status} />;
    case "priority":
      return <PriorityBadge priority={t.priority} />;
    case "assignee":
      return t.assigneeName ?? <span className="text-gray-400">Nadie</span>;
    case "created":
      return <span className="text-gray-600">{formatDateTime(t.createdAt)}</span>;
  }
}

export function TicketTable({ tickets, columns, empty }: { tickets: TicketView[]; columns: Column[]; empty: string }) {
  if (tickets.length === 0) return <p className="mt-6 text-sm text-gray-600">{empty}</p>;
  return (
    <table className="mt-4 w-full text-sm">
      <thead className="text-left text-xs uppercase text-gray-500">
        <tr>
          {columns.map((c) => (
            <th key={c} className="py-2 pr-3">{HEADERS[c]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <tr key={t.id} className="border-t border-gray-200">
            {columns.map((c) => (
              <td key={c} className="py-2 pr-3 align-top">{cell(t, c)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
