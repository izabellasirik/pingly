// Local stand-in for a production cron: calls the reminder job every minute.
// Usage: npm run cron:local   (with `npm run dev` running)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const base = process.env.APP_URL ?? env.APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET ?? env.CRON_SECRET;
if (!secret) throw new Error("Set CRON_SECRET in .env.local");

async function tick() {
  try {
    const res = await fetch(`${base}/api/cron/reminders`, { headers: { Authorization: `Bearer ${secret}` } });
    console.log(new Date().toISOString(), res.status, await res.text());
  } catch (e) {
    console.error(new Date().toISOString(), "failed:", e.message);
  }
}
await tick();
setInterval(tick, 60_000);
