import Link from "next/link";
import { can } from "@/domain/permissions";
import { ROLE_LABEL_SINGULAR } from "@/lib/labels";
import { requireSessionUser } from "@/lib/session";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSessionUser();
  const scope = user.areaName ?? (user.role === "supervisor" ? "Todas las áreas" : null);

  return (
    <div className="min-h-full">
      <header className="border-b border-gray-200 bg-gray-50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/tickets" className="font-semibold">
            Tickets Cofar
          </Link>
          <nav className="flex gap-4 text-sm">
            {can(user, "ticket.view") && <Link href="/tickets" className="hover:underline">Mis tickets</Link>}
            {can(user, "ticket.create") && <Link href="/tickets/new" className="hover:underline">Nuevo ticket</Link>}
            {can(user, "queue.view") && <Link href="/queue" className="hover:underline">Cola</Link>}
            {can(user, "ticket.take") && <Link href="/assigned" className="hover:underline">Mis asignados</Link>}
            {can(user, "dashboard.view") && <Link href="/dashboard" className="hover:underline">Dashboard</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-gray-600">
            <span>
              {user.name} · {ROLE_LABEL_SINGULAR[user.role]}
              {scope ? ` · ${scope}` : ""}
            </span>
            <form action={logout}>
              <button type="submit" className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
