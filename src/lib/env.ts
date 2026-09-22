import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

let cached: z.infer<typeof schema> | undefined;

/** Server-only environment. Fails loudly on first use if a variable is missing. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missing}. See .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}
