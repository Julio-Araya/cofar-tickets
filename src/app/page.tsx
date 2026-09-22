import { requireSessionUser } from "@/lib/session";
import { can } from "@/domain/permissions";
import { ROLE_LABEL_SINGULAR } from "@/lib/labels";
import { logout } from "./login/actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireSessionUser();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tickets Cofar</h1>
          <p className="text-sm text-gray-600">
            {user.name} · {ROLE_LABEL_SINGULAR[user.role]}
            {user.areaName ? ` · ${user.areaName}` : user.role === "supervisor" ? " · Todas las áreas" : ""}
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50">
            Salir
          </button>
        </form>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Lo que puedes hacer</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {can(user, "ticket.create") && <li>Crear tickets (fase 2)</li>}
          {can(user, "ticket.view") && <li>Ver tus tickets (fase 2)</li>}
          {can(user, "queue.view") && <li>Ver la cola de tu área (fase 3)</li>}
          {can(user, "dashboard.view") && <li>Ver el dashboard (fase 4)</li>}
        </ul>
      </section>
    </main>
  );
}
