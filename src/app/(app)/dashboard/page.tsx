import { notFound } from "next/navigation";
import { TicketTable } from "@/components/TicketTable";
import { computeMetrics } from "@/domain/metrics";
import { can } from "@/domain/permissions";
import { listTicketsForDashboard } from "@/lib/db/tickets";
import { formatHours, formatPercent } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/labels";
import { requireSessionUser } from "@/lib/session";
import { attachSla, type TicketWithSla } from "@/lib/sla";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const user = await requireSessionUser();
  if (!can(user, "dashboard.view")) notFound();

  const now = new Date();
  const tickets = await attachSla(await listTicketsForDashboard(user.areaId), now);
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const m = computeMetrics(tickets, now);
  const pick = (ids: { id: string }[]): TicketWithSla[] => ids.map((x) => byId.get(x.id)).filter((t): t is TicketWithSla => !!t);
  const scope = user.areaId === null ? "todas las áreas" : user.areaName;
  const columns = (user.areaId === null
    ? ["code", "title", "area", "location", "priority", "status", "sla", "deadline", "assignee"]
    : ["code", "title", "category", "location", "priority", "status", "sla", "deadline", "assignee"]) as Parameters<typeof TicketTable>[0]["columns"];

  return (
    <div>
      <h1 className="text-xl font-semibold">Dashboard · {scope}</h1>

      <h2 className="mt-6 text-sm font-medium uppercase text-gray-500">Ahora</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Activos" value={String(m.activeTotal)} />
        <Card label="Sin dueño" value={String(m.unassigned)} />
        <Card label={STATUS_LABELS.open} value={String(m.openByStatus.open)} />
        <Card label={STATUS_LABELS.in_progress} value={String(m.openByStatus.in_progress)} />
        <Card label={STATUS_LABELS.waiting} value={String(m.openByStatus.waiting)} />
        <Card label={STATUS_LABELS.resolved} value={String(m.openByStatus.resolved)} hint="esperan confirmación" />
      </div>

      <h2 className="mt-6 text-sm font-medium uppercase text-gray-500">Últimos 30 días</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card label="Resueltos" value={String(m.resolvedInWindow)} />
        <Card
          label="Tiempo medio de resolución"
          value={m.meanResolutionHours === null ? "—" : formatHours(m.meanResolutionHours)}
          hint="neto, sin esperas"
        />
        <Card
          label="Cumplimiento de SLA"
          value={m.slaComplianceRate === null ? "—" : formatPercent(m.slaComplianceRate)}
          hint="resueltos dentro del objetivo"
        />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <section>
          <h2 className="text-lg font-medium">Carga por agente</h2>
          {m.loadByAgent.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">Nadie tiene tickets asignados.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {m.loadByAgent.map((a) => (
                  <tr key={a.assigneeId} className="border-t border-gray-200">
                    <td className="py-1.5">{a.name}</td>
                    <td className="py-1.5 text-right font-medium">{a.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="text-lg font-medium">Vencidos ({m.overdue.length})</h2>
          <TicketTable tickets={pick(m.overdue)} columns={columns} empty="Ningún ticket activo vencido." />

          <h2 className="mt-6 text-lg font-medium">En riesgo ({m.atRisk.length})</h2>
          <TicketTable tickets={pick(m.atRisk)} columns={columns} empty="Ningún ticket activo en riesgo." />
        </section>
      </div>
    </div>
  );
}
