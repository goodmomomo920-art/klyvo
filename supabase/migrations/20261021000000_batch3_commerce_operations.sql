-- Klyvo Batch 3 commerce operations.
-- Additive only. Review and apply manually after the existing foundation and
-- Batch 2 migrations. This does not touch analytics/cart/loyalty recovery SQL.

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'manual',
  provider_payment_id text,
  transaction_reference text,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EGP',
  status text not null check (status in ('pending','successful','failed','cancelled','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, provider, provider_payment_id)
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_id uuid references public.payment_records(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique(store_id, provider, provider_event_id)
);

create table if not exists public.payment_reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_id uuid not null references public.payment_records(id) on delete cascade,
  status text not null check (status in ('open','matched','disputed','resolved')) default 'open',
  external_amount numeric(12,2),
  note text not null default '',
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'manual',
  tracking_reference text,
  status text not null check (status in ('pending','label_created','in_transit','out_for_delivery','delivered','failed','cancelled','returned')) default 'pending',
  address_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, provider, tracking_reference)
);

create table if not exists public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  provider_event_id text,
  status text not null,
  description text not null default '',
  occurred_at timestamptz not null default now(),
  unique(shipment_id, provider_event_id)
);

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('requested','approved','rejected','received','refunded','cancelled')) default 'requested',
  reason text not null,
  idempotency_key text not null,
  requested_by text not null default 'merchant',
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, idempotency_key)
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references public.return_requests(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  reason text not null default ''
);

create table if not exists public.refund_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  return_request_id uuid references public.return_requests(id),
  payment_id uuid references public.payment_records(id),
  provider text not null default 'manual',
  provider_refund_id text,
  amount numeric(12,2) not null check (amount > 0),
  status text not null check (status in ('requested','processing','succeeded','failed')) default 'requested',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(store_id, idempotency_key)
);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  storage_bucket text not null default 'product-media',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique(store_id, storage_path)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  recipient text,
  sensitive boolean not null default false,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(store_id, idempotency_key)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('internal','email','sms','whatsapp','push')),
  provider text not null default 'internal',
  status text not null check (status in ('queued','sent','failed','skipped')) default 'queued',
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notification_id, channel, provider)
);

do $$ declare t text; begin
  foreach t in array array['payment_records','payment_events','payment_reconciliation_records','shipments','shipment_events','return_requests','return_items','refund_records','product_media','notifications','notification_deliveries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_store_owner_access on public.%I', t, t);
    execute format('create policy %I_store_owner_access on public.%I for all to authenticated using (exists (select 1 from public.stores s where s.id = %I.store_id and s.owner_id = auth.uid())) with check (exists (select 1 from public.stores s where s.id = %I.store_id and s.owner_id = auth.uid()))', t, t, t, t);
  end loop;
end $$;
