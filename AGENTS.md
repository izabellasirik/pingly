<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pingly project notes

- Stack: Next.js 16 App Router (Cache Components + Partial Prefetching), Tailwind v4, Supabase (Auth + Postgres + RLS), Anthropic SDK, Resend.
- Every signed-in read happens inside `<Suspense>`; `getCurrentUser()` calls `connection()` so user data is rendered per request.
- All data access uses the user's own Supabase session (`src/lib/data.ts`, `src/lib/mutations.ts`) so RLS applies. The service-role client (`src/lib/supabase/admin.ts`) is only for the reminder scheduler and account deletion.
- The AI never writes data. `src/lib/ai/ask.ts` returns proposals; the user confirms each one and `src/lib/ai/apply.ts` re-validates before writing.
- Schema changes go in a new file under `supabase/migrations/`, then `npm run db:types`.
- Checks: `npm run typecheck && npm run lint && npm test && npm run test:e2e` (tests need `npm run db:start`).
