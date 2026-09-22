"use client";

import { useActionState } from "react";
import { changePriorityAction, type ActionState } from "@/lib/actions/tickets";
import { PRIORITIES, type Priority } from "@/domain/types";
import { PRIORITY_LABELS } from "@/lib/labels";

export function PriorityForm({ ticketId, current }: { ticketId: string; current: Priority }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePriorityAction, {});

  return (
    <form action={formAction} className="rounded border border-gray-200 p-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="from" value={current} />
      <label className="block text-sm">
        <span className="text-gray-700">Nueva prioridad</span>
        <select name="to" defaultValue={current} className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}{p === current ? " (actual)" : ""}</option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-sm">
        <span className="text-gray-700">Motivo</span>
        <textarea name="reason" required rows={2} maxLength={1000} className="mt-1 w-full rounded border border-gray-300 px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="mt-2 w-full rounded border border-gray-900 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
        {pending ? "Guardando…" : "Cambiar prioridad"}
      </button>
      {state.error && <p className="mt-2 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
