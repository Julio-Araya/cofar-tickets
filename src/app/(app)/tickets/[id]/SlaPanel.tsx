import { SlaBadge } from "@/components/SlaBadge";
import type { SlaResult } from "@/domain/sla";
import { formatDateTime, formatHours } from "@/lib/format";

export function SlaPanel({ sla }: { sla: SlaResult }) {
  if (!sla.applicable) return <p className="mt-2 text-sm text-gray-600">Ticket cancelado, sin SLA.</p>;
  return (
    <dl className="mt-3 space-y-1 rounded border border-gray-200 p-3 text-sm">
      <div className="flex justify-between"><dt className="text-gray-500">Estado</dt><dd><SlaBadge sla={sla} /></dd></div>
      <div className="flex justify-between"><dt className="text-gray-500">Objetivo actual</dt><dd>{formatHours(sla.currentTargetHours)}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-500">Tiempo consumido</dt><dd>{formatHours(sla.activeHours)}</dd></div>
      <div className="flex justify-between"><dt className="text-gray-500">Descontado por esperas</dt><dd>{formatHours(sla.waitingHours)}</dd></div>
      <div className="flex justify-between">
        <dt className="text-gray-500">{sla.stopped ? "Reloj detenido" : "Fecha límite"}</dt>
        <dd>
          {sla.stopped
            ? sla.stoppedAt ? formatDateTime(sla.stoppedAt) : "—"
            : sla.paused ? "Pausado (en espera)" : sla.deadline ? formatDateTime(sla.deadline) : "—"}
        </dd>
      </div>
      <p className="pt-1 text-xs text-gray-500">
        El tiempo corre desde la creación, se pausa en espera y se detiene al resolver. Cada tramo de prioridad se mide contra su propio objetivo.
      </p>
    </dl>
  );
}
