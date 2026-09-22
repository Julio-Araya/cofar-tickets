import type { SlaResult, SlaState } from "@/domain/sla";
import { formatDateTime, formatPercent } from "@/lib/format";

const STATE_LABEL: Record<SlaState, string> = {
  on_track: "En plazo",
  at_risk: "En riesgo",
  breached: "Vencido",
};

const STATE_CLASS: Record<SlaState, string> = {
  on_track: "bg-green-100 text-green-800",
  at_risk: "bg-orange-100 text-orange-800",
  breached: "bg-red-100 text-red-800",
};

export function slaStateLabel(sla: SlaResult): string {
  if (!sla.applicable) return "Sin SLA";
  if (sla.stopped) return sla.state === "breached" ? "Vencido" : "Cumplido";
  return STATE_LABEL[sla.state];
}

export function SlaBadge({ sla }: { sla: SlaResult }) {
  if (!sla.applicable) return <span className="text-xs text-gray-400">Sin SLA</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATE_CLASS[sla.state]}`}>
        {slaStateLabel(sla)}
      </span>
      <span className="text-xs text-gray-600">{formatPercent(sla.ratio)}</span>
    </span>
  );
}

/** Deadline cell: date, "Pausado" while waiting, or nothing when stopped within target. */
export function SlaDeadline({ sla }: { sla: SlaResult }) {
  if (!sla.applicable) return <span className="text-gray-400">—</span>;
  if (sla.paused) return <span className="text-purple-800">Pausado (en espera)</span>;
  if (sla.deadline === null) return <span className="text-gray-400">—</span>;
  // The domain already knows whether the deadline is behind us: breached means it is.
  const past = sla.state === "breached";
  return <span className={past ? "text-red-800" : "text-gray-700"}>{formatDateTime(sla.deadline)}</span>;
}
