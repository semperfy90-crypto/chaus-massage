create table if not exists public.bookings (
  id text primary key,
  service text not null,
  duration integer not null check (duration in (30,60)),
  place text not null,
  date date not null,
  time time not null,
  name text not null,
  phone text not null,
  status text not null default 'new' check (status in ('new','confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.settings (
  key text primary key,
  value text
);

alter table public.bookings enable row level security;
alter table public.settings enable row level security;

-- The server uses the Supabase service-role key, so browser clients never access the database directly.
-- Do not put SUPABASE_SERVICE_ROLE_KEY into frontend JavaScript.
