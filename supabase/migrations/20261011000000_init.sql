-- Pingly schema.
--
-- Every row belongs to exactly one auth user. Isolation is enforced twice:
--   1. Row Level Security on every table (user_id = auth.uid()).
--   2. Composite foreign keys (person_id, user_id) so a row can never point at
--      another user's person, even through the service role.

create extension if not exists pgcrypto;

-- True when Postgres recognises the IANA time zone name.
create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'UTC'
    check (char_length(timezone) between 1 and 64 and public.is_valid_timezone(timezone)),
  email_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  relationship text check (char_length(relationship) <= 60),
  birthday_month smallint check (birthday_month between 1 and 12),
  birthday_day smallint check (birthday_day between 1 and 31),
  birthday_year smallint check (birthday_year between 1900 and 2100),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Birthday is either fully absent or has at least a month and a day.
  constraint people_birthday_complete check (
    (birthday_month is null and birthday_day is null and birthday_year is null)
    or (birthday_month is not null and birthday_day is not null)
  ),
  constraint people_id_user_unique unique (id, user_id)
);

create index people_user_name_idx on public.people (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- memories: the things you know about someone
-- ---------------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint memories_person_fk foreign key (person_id, user_id)
    references public.people (id, user_id) on delete cascade
);

create index memories_person_idx on public.memories (person_id, created_at desc);
create index memories_user_idx on public.memories (user_id);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  note text check (char_length(note) <= 500),
  kind text not null default 'custom'
    check (kind in ('birthday', 'follow_up', 'check_in', 'custom')),
  remind_at timestamptz not null,
  recurrence text not null default 'none' check (recurrence in ('none', 'yearly')),
  status text not null default 'active' check (status in ('active', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_person_fk foreign key (person_id, user_id)
    references public.people (id, user_id) on delete cascade,
  constraint reminders_done_has_time check (status <> 'done' or completed_at is not null),
  constraint reminders_birthday_has_person check (kind <> 'birthday' or person_id is not null)
);

create index reminders_user_due_idx on public.reminders (user_id, status, remind_at);
create index reminders_person_idx on public.reminders (person_id, remind_at desc);
-- Used by the server-side scheduler to find due reminders quickly.
create index reminders_due_idx on public.reminders (remind_at) where status = 'active';

-- Duplicate prevention: one active birthday reminder per person, and no two
-- active reminders with the same title for the same person at the same time.
create unique index reminders_one_birthday_per_person
  on public.reminders (person_id) where status = 'active' and kind = 'birthday';
create unique index reminders_no_duplicates
  on public.reminders (
    user_id,
    coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(title)),
    remind_at
  ) where status = 'active';

-- ---------------------------------------------------------------------------
-- reminder_notifications: delivery log written only by the server scheduler.
-- The unique (reminder_id, occurrence_at) makes sending idempotent: a reminder
-- occurrence can be claimed exactly once, even by concurrent cron runs.
-- ---------------------------------------------------------------------------
create table public.reminder_notifications (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  occurrence_at timestamptz not null,
  channel text not null default 'email',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0,
  error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminder_notifications_once unique (reminder_id, occurrence_at, channel)
);

create index reminder_notifications_user_idx on public.reminder_notifications (user_id);
create index reminder_notifications_retry_idx
  on public.reminder_notifications (status, updated_at) where status in ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();
create trigger reminders_touch before update on public.reminders
  for each row execute function public.touch_updated_at();
create trigger reminder_notifications_touch before update on public.reminder_notifications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Create a profile for every new auth user.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC');
begin
  -- Only accept time zones Postgres knows about.
  if not public.is_valid_timezone(tz) then
    tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 80),
    tz
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.memories enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_notifications enable row level security;

-- Profiles: a user can read and update only their own row. Rows are created by
-- the trigger above and deleted with the auth user.
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- People / memories / reminders: full CRUD on own rows only.
create policy "people: own rows" on public.people
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "memories: own rows" on public.memories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reminders: own rows" on public.reminders
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Notification log: users may read their own delivery status; only the
-- service role (which bypasses RLS) writes it.
create policy "reminder_notifications: read own" on public.reminder_notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- Anonymous visitors get nothing.
revoke all on public.profiles, public.people, public.memories, public.reminders,
  public.reminder_notifications from anon;
revoke insert, update, delete on public.reminder_notifications from authenticated;
-- Users cannot change which account a profile belongs to or its creation time.
revoke update on public.profiles from authenticated;
grant update (display_name, timezone, email_reminders) on public.profiles to authenticated;
