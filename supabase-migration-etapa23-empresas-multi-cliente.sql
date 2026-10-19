-- Etapa 23 — a ferramenta deixa de ter um dono so
--
-- Ate aqui "parceiro" era a propria conta de usuario: nome da empresa, EIN e
-- nicho moravam na linha da pessoa, e a tabela de precos era uma so para o
-- sistema inteiro (unique por grupo+codigo, sem dono). Isso bastava no piloto,
-- onde os 20 orcamentos sao todos da Five Stars e os 5 usuarios sao da Ruche.
-- Nao basta para 13 contractors de flooring.
--
-- Esta etapa cria a camada de empresa e poe dono na tabela de precos. Momento
-- bom para fazer: nao existe nenhum usuario com papel 'parceiro' ainda, entao
-- nao ha inquilino em producao para quebrar.

-- 1) A empresa ---------------------------------------------------------
create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  nicho         text not null default 'flooring',
  -- 'partner' = modelo Ruche Partner, a Ruche fica com margem e ha repasse.
  -- 'cliente' = cliente da carteira: fica com 100%, sem repasse nem parcelas.
  revenue_model text not null default 'cliente'
                check (revenue_model in ('partner','cliente')),
  location_id   text,          -- subconta do GHL, quando existe
  endereco      text,
  ein           text,
  telefone      text,
  email         text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists empresas_location_idx
  on public.empresas(location_id) where location_id is not null;

comment on column public.empresas.revenue_model is
  'partner = ha repasse e margem Ruche. cliente = contractor fica com 100%; repasse, margem e parcelas somem da tela.';

-- 2) Vinculo nas tabelas que ja existem --------------------------------
alter table public.users                    add column if not exists empresa_id uuid references public.empresas(id);
alter table public.leads                    add column if not exists empresa_id uuid references public.empresas(id);
alter table public.proposals                add column if not exists empresa_id uuid references public.empresas(id);
alter table public.partner_orcamento_layout add column if not exists empresa_id uuid references public.empresas(id);
alter table public.motor_prices             add column if not exists empresa_id uuid references public.empresas(id);
alter table public.motor_prices             add column if not exists nicho      text;

create index if not exists leads_empresa_idx     on public.leads(empresa_id);
create index if not exists proposals_empresa_idx on public.proposals(empresa_id);
create index if not exists motor_empresa_idx     on public.motor_prices(empresa_id);

comment on column public.motor_prices.empresa_id is
  'NULL = catalogo modelo do nicho, usado para provisionar empresa nova. Preenchido = catalogo daquela empresa.';

-- 3) A empresa do piloto, e o backfill ---------------------------------
-- Todo o dado atual e da Five Stars: uma location configurada, 20 orcamentos,
-- um layout. Os 3 "donos" sao gente da Ruche operando pelo contractor.
insert into public.empresas (nome, nicho, revenue_model, location_id)
select 'Five Stars Contractors', 'flooring', 'partner', 'jl5iFelWb5hiWu9FIeiD'
where not exists (select 1 from public.empresas where location_id = 'jl5iFelWb5hiWu9FIeiD');

update public.leads                    set empresa_id = e.id from public.empresas e where e.location_id='jl5iFelWb5hiWu9FIeiD' and leads.empresa_id is null;
update public.proposals                set empresa_id = e.id from public.empresas e where e.location_id='jl5iFelWb5hiWu9FIeiD' and proposals.empresa_id is null;
update public.partner_orcamento_layout set empresa_id = e.id from public.empresas e where e.location_id='jl5iFelWb5hiWu9FIeiD' and partner_orcamento_layout.empresa_id is null;
update public.motor_prices             set empresa_id = e.id from public.empresas e where e.location_id='jl5iFelWb5hiWu9FIeiD' and motor_prices.empresa_id is null;
update public.motor_prices             set nicho = 'flooring' where nicho is null;

-- 4) Catalogo modelo de flooring ---------------------------------------
-- A unique antiga era (grupo, codigo) e impedia o mesmo componente existir
-- para duas empresas. Sai, e entram duas parciais: uma por empresa, outra
-- para o modelo do nicho.
alter table public.motor_prices drop constraint if exists motor_prices_grupo_codigo_key;

insert into public.motor_prices
  (empresa_id, nicho, grupo, codigo, componente, unidade, preco_cliente, repasse_partida, teto_repasse, ativo)
select null, 'flooring', grupo, codigo, componente, unidade, preco_cliente, repasse_partida, teto_repasse, ativo
  from public.motor_prices
 where empresa_id is not null and nicho = 'flooring'
   and not exists (
     select 1 from public.motor_prices t
      where t.empresa_id is null and t.nicho = 'flooring'
        and t.grupo = motor_prices.grupo and t.codigo = motor_prices.codigo
   );

create unique index if not exists motor_prices_empresa_uk
  on public.motor_prices(empresa_id, grupo, codigo) where empresa_id is not null;
create unique index if not exists motor_prices_modelo_uk
  on public.motor_prices(nicho, grupo, codigo) where empresa_id is null;

-- 5) Quem sou eu ---------------------------------------------------------
-- SECURITY DEFINER e stable: le users sem passar pela RLS de users, que e o
-- caminho classico de recursao infinita em policy.
create or replace function public.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $fn_emp$
  select empresa_id from public.users where id = auth.uid()
$fn_emp$;

revoke all on function public.empresa_atual() from public, anon;
grant execute on function public.empresa_atual() to authenticated, service_role;

-- 6) RLS -----------------------------------------------------------------
alter table public.empresas enable row level security;
grant select on public.empresas to authenticated;
grant all    on public.empresas to service_role;

drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (has_role(auth.uid(),'ruche') or id = public.empresa_atual());

drop policy if exists empresas_ruche_write on public.empresas;
create policy empresas_ruche_write on public.empresas for all to authenticated
  using (has_role(auth.uid(),'ruche')) with check (has_role(auth.uid(),'ruche'));

-- O furo que esta etapa fecha: motor_prices_read tinha qual = true, entao
-- qualquer usuario logado lia a tabela de precos inteira. Com um contractor
-- so isso era invisivel; com treze seria o preco de um exposto ao outro.
drop policy if exists motor_prices_read on public.motor_prices;
create policy motor_prices_read on public.motor_prices for select to authenticated
  using (has_role(auth.uid(),'ruche') or empresa_id = public.empresa_atual());

-- Dados do orcamento: segue valendo o dono pessoal (nao ha parceiro ainda),
-- e passa a valer tambem a empresa — e o que permite dois vendedores do mesmo
-- contractor enxergarem a mesma carteira.
drop policy if exists leads_partner_all on public.leads;
create policy leads_partner_all on public.leads for all to authenticated
  using       (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'))
  with check  (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'));

drop policy if exists proposals_partner_all on public.proposals;
create policy proposals_partner_all on public.proposals for all to authenticated
  using       (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'))
  with check  (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'));

drop policy if exists layout_select on public.partner_orcamento_layout;
create policy layout_select on public.partner_orcamento_layout for select to authenticated
  using (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'));

drop policy if exists layout_write on public.partner_orcamento_layout;
create policy layout_write on public.partner_orcamento_layout for all to authenticated
  using       (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'))
  with check  (partner_id = auth.uid() or empresa_id = public.empresa_atual() or has_role(auth.uid(),'ruche'));

-- 7) Provisionar empresa nova -------------------------------------------
-- Clona o catalogo modelo do nicho. Sem isso, empresa nova nasce sem preco
-- nenhum e o primeiro orcamento dela sai zerado.
create or replace function public.rpc_criar_empresa(
  p_nome          text,
  p_nicho         text default 'flooring',
  p_revenue_model text default 'cliente',
  p_location_id   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn_nova$
declare
  v_id uuid;
  v_n  integer;
begin
  if auth.uid() is null or not has_role(auth.uid(),'ruche') then
    raise exception 'Apenas Ruche pode criar empresa';
  end if;

  insert into public.empresas (nome, nicho, revenue_model, location_id)
  values (p_nome, p_nicho, p_revenue_model, p_location_id)
  returning id into v_id;

  insert into public.motor_prices
    (empresa_id, nicho, grupo, codigo, componente, unidade, preco_cliente, repasse_partida, teto_repasse, ativo)
  select v_id, nicho, grupo, codigo, componente, unidade, preco_cliente, repasse_partida, teto_repasse, ativo
    from public.motor_prices
   where empresa_id is null and nicho = p_nicho;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise warning 'Nicho % nao tem catalogo modelo: a empresa nasceu sem preco.', p_nicho;
  end if;

  return v_id;
end
$fn_nova$;

revoke all on function public.rpc_criar_empresa(text, text, text, text) from public, anon;
grant execute on function public.rpc_criar_empresa(text, text, text, text) to authenticated, service_role;

-- Conferencia ------------------------------------------------------------
-- select nome, nicho, revenue_model, location_id from public.empresas;
-- select coalesce(e.nome,'(modelo do nicho)') dono, mp.nicho, count(*)
--   from public.motor_prices mp left join public.empresas e on e.id = mp.empresa_id
--  group by 1,2 order by 1;
