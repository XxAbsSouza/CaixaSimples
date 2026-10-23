-- Rode no Supabase: SQL Editor > New query > Run
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  total numeric(10,2) not null check (total >= 0),
  change_amount numeric(10,2) not null default 0 check (change_amount >= 0),
  paid_at timestamptz not null default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0)
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  method text not null check (method in ('pix','cash')),
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index on orders (paid_at desc);
create index on order_items (order_id);
create index on payments (order_id);

-- Finaliza a venda em uma única transação. Preços vêm do banco, não do app.
-- p_cash = dinheiro RECEBIDO (antes do troco). Em payments, o dinheiro é gravado
-- já descontando o troco, então soma(payments) = total.
create or replace function finalize_sale(
  p_customer_id uuid, p_items jsonb, p_pix numeric, p_cash numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid; v_total numeric(10,2); v_cnt int; v_ok int;
  v_paid numeric(10,2); v_change numeric(10,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;
  p_pix := round(coalesce(p_pix, 0), 2);
  p_cash := round(coalesce(p_cash, 0), 2);
  if p_pix < 0 or p_cash < 0 then raise exception 'Valor inválido'; end if;

  if exists (select 1 from jsonb_to_recordset(p_items) as i(product_id uuid, quantity int)
             where i.quantity is null or i.quantity <= 0) then
    raise exception 'Quantidade inválida';
  end if;

  select sum(p.price * i.quantity), count(*), count(*) filter (where p.active)
    into v_total, v_cnt, v_ok
    from jsonb_to_recordset(p_items) as i(product_id uuid, quantity int)
    left join products p on p.id = i.product_id;
  if v_cnt <> v_ok then raise exception 'Produto inexistente ou inativo'; end if;

  v_paid := p_pix + p_cash;
  if v_paid < v_total then raise exception 'Pagamento insuficiente'; end if;
  if p_pix > v_total then raise exception 'PIX maior que o total'; end if;
  v_change := v_paid - v_total;

  insert into orders (customer_id, total, change_amount)
    values (p_customer_id, v_total, v_change) returning id into v_order;

  insert into order_items (order_id, product_id, quantity, unit_price)
    select v_order, i.product_id, i.quantity, p.price
    from jsonb_to_recordset(p_items) as i(product_id uuid, quantity int)
    join products p on p.id = i.product_id;

  if p_pix > 0 then
    insert into payments (order_id, method, amount) values (v_order, 'pix', p_pix);
  end if;
  if p_cash - v_change > 0 then
    insert into payments (order_id, method, amount) values (v_order, 'cash', p_cash - v_change);
  end if;
  return v_order;
end $$;

-- Sem autenticação: o app usa a chave anon. Vendas só entram via RPC.
alter table customers enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
create policy "anon all" on customers for all to anon using (true) with check (true);
create policy "anon all" on products  for all to anon using (true) with check (true);
create policy "anon read" on orders      for select to anon using (true);
create policy "anon read" on order_items for select to anon using (true);
create policy "anon read" on payments    for select to anon using (true);
grant execute on function finalize_sale(uuid, jsonb, numeric, numeric) to anon;
