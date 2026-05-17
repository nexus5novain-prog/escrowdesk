
-- =========================
-- Enums
-- =========================
create type public.app_role as enum ('admin', 'moderator', 'user');
create type public.asset_type as enum ('USDT', 'BTC');
create type public.offer_side as enum ('buy', 'sell'); -- maker wants to buy or sell crypto
create type public.offer_status as enum ('active', 'paused', 'closed');
create type public.trade_status as enum ('pending_payment', 'paid', 'released', 'cancelled', 'disputed');
create type public.dispute_status as enum ('open', 'resolved_buyer', 'resolved_seller');
create type public.tx_kind as enum ('deposit', 'withdraw', 'escrow_lock', 'escrow_release', 'escrow_refund', 'fee', 'adjustment');

-- =========================
-- Helper: update updated_at
-- =========================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- profiles
-- =========================
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  telegram_user_id bigint unique,
  telegram_username text,
  trades_completed int not null default 0,
  rating_sum int not null default 0,
  rating_count int not null default 0,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_profiles_telegram on public.profiles(telegram_user_id);

alter table public.profiles enable row level security;

create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- =========================
-- user_roles (security best practice: separate table)
-- =========================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','moderator')
  );
$$;

-- =========================
-- wallets (ledger)
-- =========================
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset asset_type not null,
  available numeric(24,8) not null default 0,
  escrow numeric(24,8) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, asset)
);
alter table public.wallets enable row level security;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.update_updated_at_column();

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset asset_type not null,
  kind tx_kind not null,
  amount numeric(24,8) not null,
  trade_id uuid,
  note text,
  created_at timestamptz not null default now()
);
alter table public.wallet_transactions enable row level security;
create index idx_wallet_tx_user on public.wallet_transactions(user_id, created_at desc);

-- =========================
-- payment_methods
-- =========================
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,                 -- e.g. "Bank Transfer (Chase)"
  method_type text not null,           -- e.g. "bank", "wise", "paypal", "revolut"
  details text not null,               -- free-text (account number, email, etc.)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;

-- =========================
-- offers
-- =========================
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  maker_id uuid not null references auth.users(id) on delete cascade,
  side offer_side not null,                  -- maker wants to buy or sell crypto
  asset asset_type not null,
  fiat_currency text not null,               -- ISO-like, e.g. USD, EUR, NGN
  price numeric(24,8) not null,              -- price per 1 unit asset, in fiat
  min_amount numeric(24,2) not null,         -- in fiat
  max_amount numeric(24,2) not null,         -- in fiat
  available_crypto numeric(24,8) not null,   -- crypto remaining to trade
  payment_method_types text[] not null default '{}',
  terms text,
  status offer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.offers enable row level security;
create index idx_offers_status on public.offers(status);
create index idx_offers_filter on public.offers(asset, fiat_currency, side, status);
create trigger trg_offers_updated_at
before update on public.offers
for each row execute function public.update_updated_at_column();

-- =========================
-- trades
-- =========================
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,   -- buyer of crypto
  seller_id uuid not null references auth.users(id) on delete restrict,  -- seller of crypto
  asset asset_type not null,
  fiat_currency text not null,
  price numeric(24,8) not null,
  crypto_amount numeric(24,8) not null,
  fiat_amount numeric(24,2) not null,
  fee_amount numeric(24,8) not null default 0,        -- in crypto, taken from seller
  payment_method_id uuid references public.payment_methods(id),
  status trade_status not null default 'pending_payment',
  payment_window_minutes int not null default 30,
  paid_at timestamptz,
  released_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trades enable row level security;
create index idx_trades_buyer on public.trades(buyer_id);
create index idx_trades_seller on public.trades(seller_id);
create trigger trg_trades_updated_at
before update on public.trades
for each row execute function public.update_updated_at_column();

-- =========================
-- trade_messages
-- =========================
create table public.trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.trade_messages enable row level security;
create index idx_trade_messages_trade on public.trade_messages(trade_id, created_at);

-- =========================
-- disputes
-- =========================
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null unique references public.trades(id) on delete cascade,
  opened_by uuid not null references auth.users(id),
  reason text not null,
  status dispute_status not null default 'open',
  resolved_by uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.disputes enable row level security;

-- =========================
-- platform_settings (key-value)
-- =========================
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;

insert into public.platform_settings(key, value) values
  ('fee_bps', '100'::jsonb),                  -- 1% taker fee, basis points
  ('supported_assets', '["USDT","BTC"]'::jsonb),
  ('supported_fiats', '["USD","EUR","NGN","GBP"]'::jsonb),
  ('min_trade_fiat', '5'::jsonb);

-- =========================
-- telegram_link_codes
-- =========================
create table public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);
alter table public.telegram_link_codes enable row level security;

-- =========================
-- New user trigger: create profile + default wallets + 'user' role
-- =========================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role) values (new.id, 'user')
  on conflict do nothing;

  insert into public.wallets (user_id, asset) values
    (new.id, 'USDT'),
    (new.id, 'BTC')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================
-- RLS POLICIES
-- =========================

-- profiles: public read of non-sensitive fields, owner can update, staff can update bans
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = user_id);

create policy "Staff can update any profile"
  on public.profiles for update using (public.is_staff(auth.uid()));

-- user_roles: users read own; staff read all
create policy "Users can view own roles"
  on public.user_roles for select using (auth.uid() = user_id);

create policy "Staff can view all roles"
  on public.user_roles for select using (public.is_staff(auth.uid()));

create policy "Admins manage roles"
  on public.user_roles for all using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- wallets: owner-only; staff read
create policy "Users view own wallets"
  on public.wallets for select using (auth.uid() = user_id);
create policy "Staff view all wallets"
  on public.wallets for select using (public.is_staff(auth.uid()));
-- writes happen via server functions using service-role; no direct user writes.

-- wallet_transactions: owner read; staff read
create policy "Users view own tx"
  on public.wallet_transactions for select using (auth.uid() = user_id);
create policy "Staff view all tx"
  on public.wallet_transactions for select using (public.is_staff(auth.uid()));

-- payment_methods: owner full; staff read
create policy "Users manage own pm"
  on public.payment_methods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Staff read pm"
  on public.payment_methods for select using (public.is_staff(auth.uid()));

-- offers: public read of active; maker manages own; staff manage all
create policy "Anyone can read offers"
  on public.offers for select using (true);
create policy "Maker can insert own offer"
  on public.offers for insert with check (auth.uid() = maker_id);
create policy "Maker can update own offer"
  on public.offers for update using (auth.uid() = maker_id);
create policy "Staff can update any offer"
  on public.offers for update using (public.is_staff(auth.uid()));

-- trades: only participants and staff
create policy "Participants read trades"
  on public.trades for select using (auth.uid() = buyer_id or auth.uid() = seller_id or public.is_staff(auth.uid()));
-- inserts/updates via server functions

-- trade_messages: only trade participants and staff
create policy "Trade participants read messages"
  on public.trade_messages for select using (
    public.is_staff(auth.uid()) or exists (
      select 1 from public.trades t
      where t.id = trade_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );
create policy "Trade participants send messages"
  on public.trade_messages for insert with check (
    sender_id = auth.uid() and exists (
      select 1 from public.trades t
      where t.id = trade_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

-- disputes: trade participants and staff
create policy "Disputes read by participants/staff"
  on public.disputes for select using (
    public.is_staff(auth.uid()) or exists (
      select 1 from public.trades t
      where t.id = trade_id and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

-- platform_settings: public read, admin write
create policy "Settings public read"
  on public.platform_settings for select using (true);
create policy "Admins manage settings"
  on public.platform_settings for all using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- telegram_link_codes: owner only
create policy "Users own link codes"
  on public.telegram_link_codes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table public.trade_messages;
alter publication supabase_realtime add table public.trades;
