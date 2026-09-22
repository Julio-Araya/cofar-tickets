"use client";

import { useActionState } from "react";
import { transitionTicketAction, type ActionState } from "@/lib/actions/tickets";
import type { Transition } from "@/domain/stateMachine";

/** Button label and reason prompt per target state, from the acting user's point of view. */
const LABELS: Record<string, { button: string; reasonLabel?: string }> = {
  "open->in_progress": { button: "Tomar" },
  "in_progress->open": { button: "Soltar" },
  "in_progress->waiting": { button: "Poner en espera", reasonLabel: "Motivo de la espera" },
  "waiting->in_progress": { button: "Retomar" },
  "in_progress->resolved": { button: "Marcar resuelto", reasonLabel: "Nota de resolución" },
  "resolved->closed": { button: "Confirmar y cerrar" },
  "resolved->in_progress": { button: "Reabrir", reasonLabel: "Motivo para reabrir" },
  "open->cancelled": { button: "Cancelar ticket" },
};

function TransitionForm({ ticketId, transition }: { ticketId: string; transition: Transition }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transitionTicketAction, {});
  const key = `${transition.from}->${transition.to}`;
  const label = LABELS[key] ?? { button: `Pasar a ${transition.to}` };

  return (
    <form action={formAction} className="rounded border border-gray-200 p-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="from" value={transition.from} />
      <input type="hidden" name="to" value={transition.to} />
      {transition.requiresReason && (
        <label className="block text-sm">
          <span className="text-gray-700">{label.reasonLabel ?? "Motivo"}</span>
          <textarea name="reason" required rows={2} maxLength={1000} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
        </label>
      )}
      <button type="submit" disabled={pending} className="mt-2 w-full rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
        {pending ? "Guardando…" : label.button}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

export function TicketActions({ ticketId, transitions }: { ticketId: string; transitions: Transition[] }) {
  if (transitions.length === 0) {
    return <p className="mt-2 text-sm text-gray-600">No hay acciones disponibles para ti en este estado.</p>;
  }
  return (
    <div className="mt-3 space-y-3">
      {transitions.map((t) => (
        <TransitionForm key={`${t.from}->${t.to}`} ticketId={ticketId} transition={t} />
      ))}
    </div>
  );
}
