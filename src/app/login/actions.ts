"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserById } from "@/lib/db/users";
import { clearSessionUser, setSessionUser } from "@/lib/session";

const loginSchema = z.object({ userId: z.uuid() });

export async function loginAs(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) redirect("/login?error=invalid");

  const user = await getUserById(parsed.data.userId);
  if (!user) redirect("/login?error=unknown");

  await setSessionUser(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await clearSessionUser();
  redirect("/login");
}
