-- Taxi Almosafir orders storage.
-- Run once in the Supabase SQL editor for the project used by the website.

create table if not exists public.orders (
  reference text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null default 'new' check (status in ('new','confirmed','completed','cancelled')),
  status_history jsonb not null default '[]'::jsonb,
  name text not null,
  phone text not null,
  car text not null,
  passengers integer not null default 1 check (passengers >= 1),
  bags integer not null default 0 check (bags >= 0),
  address text not null default '',
  notes text not null default '',
  lat double precision,
  lng double precision,
  maps text not null default '',
  source text not null default 'website',
  telegram text not null default 'pending'
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_phone_idx on public.orders (phone);

alter table public.orders enable row level security;

-- Customer data must never be exposed to browser roles.
revoke all on table public.orders from anon, authenticated;

-- 2026 Supabase projects may not auto-expose newly created tables to the Data API.
-- The website backend uses a server-only secret/service-role key.
grant usage on schema public to service_role;
grant select, insert, update on table public.orders to service_role;
