-- Initial schema for the ticket system (BRIEF §7).
-- Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('requester', 'agent', 'supervisor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type location_type as enum ('office', 'pharmacy', 'warehouse');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'in_progress', 'waiting', 'resolved', 'closed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_priority as enum ('high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_source as enum ('web');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_event_type as enum ('created', 'taken', 'released', 'status_changed', 'priority_changed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Master data (ERP will be the source of truth later: external_ref)
-- ---------------------------------------------------------------------------
create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  external_ref text
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id),
  name text not null,
  default_priority ticket_priority not null,
  active boolean not null default true,
  unique (area_id, name)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type location_type not null,
  external_ref text
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role user_role not null,
  area_id uuid references areas(id),
  location_id uuid not null references locations(id),
  external_ref text,
  -- An agent always belongs to an area. A supervisor with null area sees all areas.
  constraint users_agent_has_area check (role <> 'agent' or area_id is not null)
);

create table if not exists sla_policies (
  id uuid primary key default gen_random_uuid(),
  priority ticket_priority not null,
  area_id uuid references areas(id),
  resolution_hours integer not null check (resolution_hours > 0)
);

-- One default policy per priority (area_id null) and at most one per area.
create unique index if not exists sla_policies_default_priority_idx
  on sla_policies (priority) where area_id is null;
create unique index if not exists sla_policies_area_priority_idx
  on sla_policies (area_id, priority) where area_id is not null;

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
create sequence if not exists ticket_code_seq;

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TK-' || lpad(nextval('ticket_code_seq')::text, 4, '0')),
  title text not null check (length(title) between 1 and 200),
  description text not null check (length(description) between 1 and 5000),
  category_id uuid not null references categories(id),
  -- Copied from the category at creation so catalog changes do not move history.
  area_id uuid not null references areas(id),
  location_id uuid not null references locations(id),
  requester_id uuid not null references users(id),
  assignee_id uuid references users(id),
  status ticket_status not null default 'open',
  priority ticket_priority not null,
  source ticket_source not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  constraint tickets_assignee_matches_status check (
    (status in ('open', 'cancelled') and assignee_id is null)
    or (status in ('in_progress', 'waiting', 'resolved', 'closed') and assignee_id is not null)
  )
);

create index if not exists tickets_area_status_idx on tickets (area_id, status);
create index if not exists tickets_requester_idx on tickets (requester_id);
create index if not exists tickets_assignee_idx on tickets (assignee_id);
create index if not exists tickets_created_at_idx on tickets (created_at);

-- ---------------------------------------------------------------------------
-- Event log: insert only
-- ---------------------------------------------------------------------------
create table if not exists ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id),
  actor_id uuid not null references users(id),
  type ticket_event_type not null,
  from_status ticket_status,
  to_status ticket_status,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_created_idx on ticket_events (ticket_id, created_at);
create index if not exists ticket_events_created_at_idx on ticket_events (created_at);

create or replace function forbid_ticket_event_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ticket_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists ticket_events_immutable on ticket_events;
create trigger ticket_events_immutable
  before update or delete on ticket_events
  for each row execute function forbid_ticket_event_change();

-- Also close the door at grant level for the non-service roles.
revoke update, delete, truncate on ticket_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tickets_set_updated_at on tickets;
create trigger tickets_set_updated_at
  before update on tickets
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: enabled everywhere, no policies. Only the service role (server) reads
-- or writes. The browser never talks to Supabase.
-- ---------------------------------------------------------------------------
alter table areas enable row level security;
alter table categories enable row level security;
alter table locations enable row level security;
alter table users enable row level security;
alter table sla_policies enable row level security;
alter table tickets enable row level security;
alter table ticket_events enable row level security;
