import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env.test", quiet: true, override: true });

// Integration tests create and delete users and reminders. Never point them
// at a hosted project.
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (url && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(`Refusing to run tests against non-local Supabase (${url}).`);
}
