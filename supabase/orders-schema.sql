-- Taxi Almosafir orders storage.
-- Run this safely in the Supabase SQL editor. It can be re-run after upgrades.

create table if not exists public.orders (
  reference text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null default 'new' check (status in ('new','confirmed','completed','cancelled')),
  status_history jsonb not null default '[]'::jsonb,
  name text not null,
  phone text not null,
  car text not null,
  trip_type text not null default '',
  trip_label text not null default '',
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

-- Safe upgrade path for databases created before trip type was added.
alter table public.orders add column if not exists trip_type text not null default '';
alter table public.orders add column if not exists trip_label text not null default '';

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_phone_idx on public.orders (phone);
create index if not exists orders_trip_type_idx on public.orders (trip_type);
create index if not exists orders_car_idx on public.orders (car);

alter table public.orders enable row level security;

-- Customer data must never be exposed to browser roles.
revoke all on table public.orders from anon, authenticated;

-- The website backend uses a server-only secret/service-role key.
grant usage on schema public to service_role;
grant select, insert, update on table public.orders to service_role;
