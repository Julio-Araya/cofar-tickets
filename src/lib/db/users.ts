import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ROLES, type DomainUser } from "@/domain/types";

const userRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  area_id: z.uuid().nullable(),
  location_id: z.uuid(),
  area: z.object({ name: z.string() }).nullable(),
  location: z.object({ name: z.string() }).nullable(),
});

export interface AppUser extends DomainUser {
  name: string;
  email: string;
  locationId: string;
  areaName: string | null;
  locationName: string | null;
}

const SELECT = "id, name, email, role, area_id, location_id, area:areas(name), location:locations(name)";

function toAppUser(row: unknown): AppUser {
  const r = userRowSchema.parse(row);
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    areaId: r.area_id,
    locationId: r.location_id,
    areaName: r.area?.name ?? null,
    locationName: r.location?.name ?? null,
  };
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select(SELECT)
    .order("role")
    .order("name");
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.map(toAppUser);
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getUserById: ${error.message}`);
  return data ? toAppUser(data) : null;
}
