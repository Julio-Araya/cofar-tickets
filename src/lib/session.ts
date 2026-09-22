import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserById, type AppUser } from "@/lib/db/users";

/**
 * Simulated authentication (BRIEF §6): the cookie holds the id of a
 * pre-loaded user. The real version would use corporate SSO and RLS on the JWT.
 */
export const SESSION_COOKIE = "cofar_session_user";

const userIdSchema = z.uuid();

export async function setSessionUser(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionUser(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the current user or null. Never throws on a bad cookie. */
export async function getSessionUser(): Promise<AppUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const parsed = userIdSchema.safeParse(raw);
  if (!parsed.success) return null;
  return getUserById(parsed.data);
}

/** Use in pages and actions that need a logged-in user. Redirects to /login otherwise. */
export async function requireSessionUser(): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
