create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'saving')),
  name text not null,
  icon text not null default 'tag',
  color text not null default '#9af5ef',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('expense', 'income', 'saving')),
  amount numeric(14,2) not null check (amount > 0),
  title text not null,
  note text,
  occurred_on date not null default current_date,
  payment_method text not null default 'otro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create index if not exists categories_user_type_name_idx on public.categories(user_id, type, name);
create index if not exists transactions_user_date_idx on public.transactions(user_id, occurred_on desc);
create index if not exists transactions_category_id_idx on public.transactions(category_id);

create policy "categories readable"
on public.categories for select
to authenticated
using (user_id is null or user_id = (select auth.uid()));

create policy "users insert own categories"
on public.categories for insert
to authenticated
with check (user_id = (select auth.uid()) and is_default = false);

create policy "users update own categories"
on public.categories for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and is_default = false);

create policy "users delete own categories"
on public.categories for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "users read own transactions"
on public.transactions for select
to authenticated
using (user_id = (select auth.uid()));

create policy "users insert own transactions"
on public.transactions for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "users update own transactions"
on public.transactions for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "users delete own transactions"
on public.transactions for delete
to authenticated
using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.transactions;
