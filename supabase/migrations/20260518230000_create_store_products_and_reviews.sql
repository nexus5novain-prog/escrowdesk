-- Create store_products table and reviews table, and extend profiles

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  card_number text,
  card_user text,
  card_type text,
  card_bank text,
  card_address text,
  price_usd numeric not null default 0,
  created_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_store_products_category on public.store_products(category);
create index if not exists idx_store_products_created_at on public.store_products(created_at desc);

-- Reviews for trades / users
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer uuid not null,
  target_user uuid not null,
  trade_id uuid,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);
create index if not exists idx_reviews_target_user on public.reviews(target_user);

-- Augment profiles with avatar and rating aggregates
alter table if exists public.profiles
  add column if not exists avatar_url text,
  add column if not exists rating_sum numeric default 0,
  add column if not exists rating_count int default 0;

-- Function to apply a review and update aggregates
create or replace function public.apply_review(_reviewer uuid, _target uuid, _trade uuid, _rating int, _comment text)
returns void as $$
begin
  insert into public.reviews (reviewer, target_user, trade_id, rating, comment) values (_reviewer, _target, _trade, _rating, _comment);
  update public.profiles set rating_sum = coalesce(rating_sum,0) + _rating, rating_count = coalesce(rating_count,0) + 1 where user_id = _target;
end;
$$ language plpgsql;
