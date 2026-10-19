-- Klyvo Batch 2 operations tables. This migration is intentionally independent
-- of the unresolved 20261018000000 analytics/carts/loyalty migration.
-- Review and apply manually in Supabase after the foundation migrations.

create table if not exists public.inventory_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0 and low_stock_threshold <= 1000000),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  movement_type text not null check (movement_type in ('receipt','adjustment','order','return','correction')),
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null default '',
  idempotency_key text not null,
  responsible_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (variant_id is not null)),
  unique (store_id, idempotency_key)
);

create index if not exists inventory_movements_store_created_idx on public.inventory_movements(store_id, created_at desc);
create index if not exists inventory_movements_product_idx on public.inventory_movements(store_id, product_id);
create index if not exists inventory_movements_variant_idx on public.inventory_movements(store_id, variant_id);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','store_admin','orders_manager','product_inventory_manager','marketing_manager','read_only_analyst')),
  status text not null default 'invited' check (status in ('invited','active','revoked')),
  invite_token_hash text,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, email)
);

create index if not exists team_members_user_idx on public.team_members(user_id, store_id);

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.inventory_settings enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.team_members enable row level security;
alter table public.customer_notes enable row level security;
alter table public.store_audit_logs enable row level security;

-- Application server actions also enforce membership and store scope. These
-- policies prevent direct cross-store access if a client obtains a session.
do $$ declare t text; begin
  foreach t in array array['inventory_settings','inventory_movements','team_members','customer_notes','store_audit_logs'] loop
    execute format('drop policy if exists ' || t || '_store_access on public.' || t);
    execute format('create policy ' || t || '_store_access on public.' || t || ' for all to authenticated using (exists (select 1 from public.stores s where s.id = ' || t || '.store_id and s.owner_id = auth.uid())) with check (exists (select 1 from public.stores s where s.id = ' || t || '.store_id and s.owner_id = auth.uid()))');
  end loop;
end $$;

drop trigger if exists inventory_settings_updated_at on public.inventory_settings;
create trigger inventory_settings_updated_at before update on public.inventory_settings for each row execute function public.handle_updated_at();
drop trigger if exists team_members_updated_at on public.team_members;
create trigger team_members_updated_at before update on public.team_members for each row execute function public.handle_updated_at();
drop trigger if exists customer_notes_updated_at on public.customer_notes;
create trigger customer_notes_updated_at before update on public.customer_notes for each row execute function public.handle_updated_at();
