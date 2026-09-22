import { notFound } from "next/navigation";
import { can } from "@/domain/permissions";
import { listActiveCategories } from "@/lib/db/tickets";
import { requireSessionUser } from "@/lib/session";
import { NewTicketForm } from "./NewTicketForm";

export default async function NewTicketPage() {
  const user = await requireSessionUser();
  if (!can(user, "ticket.create")) notFound();
  const categories = await listActiveCategories();

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold">Nuevo ticket</h1>
      <p className="mt-1 text-sm text-gray-600">
        Se registrará desde <strong>{user.locationName}</strong>. La prioridad la define la categoría.
      </p>
      <NewTicketForm categories={categories} />
    </div>
  );
}
