import { redirect } from "next/navigation";
import { listUsers, type AppUser } from "@/lib/db/users";
import { getSessionUser } from "@/lib/session";
import { ROLES, type Role } from "@/domain/types";
import { ROLE_LABELS } from "@/lib/labels";
import { loginAs } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "El usuario elegido no es válido.",
  unknown: "Ese usuario ya no existe.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getSessionUser();
  if (current) redirect("/");

  const { error } = await searchParams;
  const users = await listUsers();
  const byRole = new Map<Role, AppUser[]>(ROLES.map((r) => [r, []]));
  for (const u of users) byRole.get(u.role)?.push(u);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Tickets Cofar</h1>
      <p className="mt-1 text-sm text-gray-600">
        Entrada simulada. Elige con quién quieres entrar.
      </p>
      {error && (
        <p className="mt-4 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {ERRORS[error] ?? "No se pudo iniciar sesión."}
        </p>
      )}

      {ROLES.map((role) => (
        <section key={role} className="mt-6">
          <h2 className="text-lg font-medium">{ROLE_LABELS[role]}</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {byRole.get(role)?.map((u) => (
              <li key={u.id}>
                <form action={loginAs}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button
                    type="submit"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <span className="block font-medium">{u.name}</span>
                    <span className="block text-xs text-gray-600">
                      {[u.areaName ?? (role === "supervisor" ? "Todas las áreas" : null), u.locationName]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
