"use client";

import { useActionState } from "react";
import { createTicketAction, type ActionState } from "@/lib/actions/tickets";
import type { CategoryOption } from "@/lib/db/tickets";
import { PRIORITY_LABELS } from "@/lib/labels";

export function NewTicketForm({ categories }: { categories: CategoryOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTicketAction, {});
  const areas = [...new Set(categories.map((c) => c.areaName))];

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{state.error}</p>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium">Título</label>
        <input id="title" name="title" required maxLength={200} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
        {state.fieldErrors?.title && <p className="mt-1 text-xs text-red-700">{state.fieldErrors.title}</p>}
      </div>

      <div>
        <label htmlFor="categoryId" className="block text-sm font-medium">Categoría</label>
        <select id="categoryId" name="categoryId" required defaultValue="" className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5">
          <option value="" disabled>Elige una categoría</option>
          {areas.map((area) => (
            <optgroup key={area} label={area}>
              {categories
                .filter((c) => c.areaName === area)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · prioridad {PRIORITY_LABELS[c.defaultPriority].toLowerCase()}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {state.fieldErrors?.categoryId && <p className="mt-1 text-xs text-red-700">{state.fieldErrors.categoryId}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">Descripción</label>
        <textarea id="description" name="description" required rows={5} maxLength={5000} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5" />
        {state.fieldErrors?.description && <p className="mt-1 text-xs text-red-700">{state.fieldErrors.description}</p>}
      </div>

      <button type="submit" disabled={pending} className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
        {pending ? "Creando…" : "Crear ticket"}
      </button>
    </form>
  );
}
