import type { TicketEventView } from "@/lib/db/tickets";
import { formatDateTime } from "@/lib/format";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { Priority, TicketStatus } from "@/domain/types";

function statusLabel(s: string | null): string {
  return s ? STATUS_LABELS[s as TicketStatus] ?? s : "";
}

function describe(e: TicketEventView): string {
  switch (e.type) {
    case "created": {
      const p = e.payload.priority as Priority | undefined;
      return p ? `Creó el ticket con prioridad ${PRIORITY_LABELS[p].toLowerCase()} (según la categoría)` : "Creó el ticket";
    }
    case "taken":
      return "Tomó el ticket";
    case "released":
      return "Soltó el ticket, vuelve a la cola";
    case "status_changed":
      return `Cambió el estado de ${statusLabel(e.fromStatus)} a ${statusLabel(e.toStatus)}`;
    case "priority_changed": {
      const from = e.payload.from as Priority | undefined;
      const to = e.payload.to as Priority | undefined;
      return from && to
        ? `Cambió la prioridad de ${PRIORITY_LABELS[from].toLowerCase()} a ${PRIORITY_LABELS[to].toLowerCase()}`
        : "Cambió la prioridad";
    }
  }
}

export function Timeline({ events }: { events: TicketEventView[] }) {
  if (events.length === 0) return <p className="mt-2 text-sm text-gray-600">Sin eventos.</p>;
  return (
    <ol className="mt-3 space-y-3 border-l border-gray-200 pl-4 text-sm">
      {events.map((e) => {
        const reason = typeof e.payload.reason === "string" ? e.payload.reason : null;
        return (
          <li key={e.id}>
            <div className="text-xs text-gray-500">{formatDateTime(e.createdAt)}</div>
            <div>
              <span className="font-medium">{e.actorName}</span> · {describe(e)}
            </div>
            {reason && <div className="mt-0.5 text-gray-700">“{reason}”</div>}
          </li>
        );
      })}
    </ol>
  );
}
