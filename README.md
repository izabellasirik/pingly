# Pingly

A personal CRM and planner: remember the people you talk to, track follow-ups,
plan your week, and log daily tasks by priority — including adding contacts
by voice.

## Features

- **Contacts** — name, phone, email, company, role, tags, notes, and a
  follow-up date. Each contact keeps a timestamped interaction log.
- **Voice capture** — click the "Voice capture" button (available on every
  page), speak or type something like *"Add contact Jane Doe, works at Acme
  as a designer, phone 555 123 4567, follow up next Friday"*, and Pingly
  extracts the name, company, role, phone, email, and follow-up date into an
  editable preview before saving. Uses the browser's built-in Speech
  Recognition API (Chrome/Edge); other browsers get a text fallback so you
  can type the transcript instead.
- **Daily tasks** — a "most important" and "least important" list for today.
- **Weekly plan** — add tasks for the current week and page back through
  previous weeks (or forward) to see what was planned.
- **Dashboard** — today's tasks plus upcoming/overdue follow-ups at a glance.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma + SQLite (local file database, no external services required)
- Browser Speech Recognition API for voice input, with a heuristic
  regex-based parser (`src/lib/parseContact.ts`) turning the transcript into
  structured fields

## Getting started

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The SQLite database file (`dev.db`) is created automatically the first time
you run a migration. All data stays local to this project directory.

## Project structure

- `src/app` — pages and API routes (`app/api/**`)
- `src/components` — client UI components (voice capture, task lists, forms)
- `src/lib` — Prisma client, week/date helpers, and the voice transcript parser
- `prisma/schema.prisma` — data model (`Contact`, `Interaction`, `DailyTask`,
  `WeeklyTask`)

## Notes

- This is built as a single-user personal app — there's no login/auth layer.
- The voice parser is heuristic (regex-based), not an LLM call, so it works
  fully offline. It always keeps the raw transcript in the contact's notes
  field as a fallback, so nothing you said is lost even if a field isn't
  picked up correctly — you can always fix fields in the review step before
  saving, or edit the contact later.
