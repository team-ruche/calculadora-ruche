-- Etapa 21 — pricing por orcamento + stage de aprovacao
--
-- O motor (motor_prices) continua sendo a tabela de partida, mas deixa de ser
-- a palavra final: cada orcamento nasce com as suas proprias linhas em
-- proposal_items e, a partir da aprovacao, elas podem ser editadas sem que o
-- recalculo as atropele.
--
-- IMPORTANTE: esta etapa NAO reescreve rpc_calcular_proposta. A funcao em
-- producao ja levou ajustes cirurgicos (remocao por ambiente) que nao estao
-- no arquivo da etapa 3b — recriar dali reverteria. O controle entra por
-- fora, num wrapper.

begin;

-- 1) Novo stage: Pricing Approval ---------------------------------------
-- Fica entre a medicao e a negociacao: o orcamento sai do parceiro, passa
-- pelo closer para ter o preco ajustado e so entao vira negociacao.
alter table public.proposals drop constraint if exists proposals_stage_check;
alter table public.proposals add constraint proposals_stage_check
  check (stage in (
    'appointment_confirmed',
    'appointment_canceled',
    'pricing_review',
    'negotiation',
    'no_deal',
    'deal'
  ));

-- 2) Estado do pricing de cada orcamento --------------------------------
-- auto     = segue o motor, recalculo livre
-- ajustado = alguem editou a mao; recalculo passa a ser recusado
-- aprovado = closer bateu o martelo
alter table public.proposals
  add column if not exists pricing_status       text not null default 'auto',
  add column if not exists pricing_aprovado_em  timestamptz,
  add column if not exists pricing_aprovado_por uuid;

alter table public.proposals drop constraint if exists proposals_pricing_status_check;
alter table public.proposals add constraint proposals_pricing_status_check
  check (pricing_status in ('auto','ajustado','aprovado'));

-- Orcamento que ja tem valor e anterior a esta etapa continua 'auto': nada
-- foi editado a mao ainda, entao o comportamento nao muda para ninguem.

-- 2b) Revisao por IA ----------------------------------------------------
-- A comparacao entre a transcricao da visita e o que foi medido fica gravada
-- no proprio orcamento: o closer abre a aba de pricing e ja encontra o
-- parecer, sem precisar rodar de novo.
alter table public.proposals
  add column if not exists ai_review    jsonb,
  add column if not exists ai_review_at timestamptz;

comment on column public.proposals.ai_review is
  'Parecer da IA comparando proposals.transcricao com rooms/itens: {resumo, faltando[], conferido[], modelo}.';

-- 3) Recalculo que respeita o pricing editado ---------------------------
create or replace function public.rpc_recalcular_se_auto(p_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn_recalc$
declare
  v_status text;
begin
  select pricing_status into v_status from public.proposals where id = p_proposal_id;
  if v_status is null then
    raise exception 'Proposta nao encontrada';
  end if;
  -- Pricing tocado a mao: o motor nao volta por cima.
  if v_status <> 'auto' then
    return v_status;
  end if;
  perform public.rpc_calcular_proposta(p_proposal_id);
  return 'auto';
end
$fn_recalc$;

-- 4) Linhas de servico ---------------------------------------------------
-- Os servicos marcados por ambiente (painting, drywall repair, ...) entram
-- no pricing com quantidade 1 e preco zero: aparecem para o closer precificar
-- em vez de sumirem do orcamento.
create or replace function public.rpc_seed_servicos(p_proposal_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn_seed$
declare
  v_n integer;
begin
  if (select pricing_status from public.proposals where id = p_proposal_id) <> 'auto' then
    return 0;
  end if;

  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  select p_proposal_id, 'extra', 'srv_' || s.servico,
         r.nome || ' — ' || initcap(replace(s.servico, '_', ' ')),
         'job', 1, 0, 0, 0, 0, 0
  from public.proposal_rooms r
  cross join lateral unnest(coalesce(r.servicos, '{}'::text[])) as s(servico)
  where r.proposal_id = p_proposal_id;

  get diagnostics v_n = row_count;
  return v_n;
end
$fn_seed$;

-- 5) Salvar o pricing editado -------------------------------------------
-- p_itens: [{"id":uuid,"quantidade":n,"preco_cliente_unit":n,"repasse_unit":n}]
-- Campo ausente no json mantem o valor atual. O repasse continua limitado
-- ao teto do motor — esse teto e a protecao da margem, nao um palpite.
create or replace function public.rpc_salvar_pricing(p_proposal_id uuid, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn_save$
declare
  v_cli numeric;
  v_rep numeric;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode ajustar o pricing';
  end if;
  if not exists (select 1 from public.proposals where id = p_proposal_id) then
    raise exception 'Proposta nao encontrada';
  end if;

  with novo as (
    select (j->>'id')::uuid                  as id,
           (j->>'quantidade')::numeric       as qtd,
           (j->>'preco_cliente_unit')::numeric as pc,
           (j->>'repasse_unit')::numeric     as ru
      from jsonb_array_elements(p_itens) j
  ), calc as (
    select pi.id,
           greatest(coalesce(n.qtd, pi.quantidade), 0)          as q,
           greatest(coalesce(n.pc, pi.preco_cliente_unit), 0)   as p,
           -- Linha que veio do motor respeita o teto de repasse. Linha de
           -- servico ou manual nasce com teto zero: la o teto e o proprio
           -- valor digitado, senao o repasse ficaria preso em zero.
           case
             when pi.repasse_teto > 0
               then least(greatest(coalesce(n.ru, pi.repasse_unit), 0), pi.repasse_teto)
             else greatest(coalesce(n.ru, pi.repasse_unit), 0)
           end                                                  as r
      from public.proposal_items pi
      join novo n on n.id = pi.id
     where pi.proposal_id = p_proposal_id
  )
  update public.proposal_items pi
     set quantidade         = c.q,
         preco_cliente_unit = c.p,
         repasse_unit       = c.r,
         repasse_teto       = greatest(pi.repasse_teto, c.r),
         subtotal_cliente   = c.q * c.p,
         subtotal_repasse   = c.q * c.r
    from calc c
   where pi.id = c.id;

  select coalesce(sum(subtotal_cliente), 0), coalesce(sum(subtotal_repasse), 0)
    into v_cli, v_rep
    from public.proposal_items where proposal_id = p_proposal_id;

  update public.proposals
     set total_cliente  = v_cli,
         total_repasse  = v_rep,
         margem_ruche   = v_cli - v_rep,
         -- so promove de auto para ajustado; nao rebaixa um ja aprovado
         pricing_status = case when pricing_status = 'auto' then 'ajustado' else pricing_status end,
         updated_at     = now()
   where id = p_proposal_id;
end
$fn_save$;

-- 6) Linha avulsa (servico que o motor nao tem) -------------------------
create or replace function public.rpc_adicionar_item_pricing(
  p_proposal_id       uuid,
  p_componente        text,
  p_unidade           text,
  p_quantidade        numeric,
  p_preco_cliente_unit numeric,
  p_repasse_unit      numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $fn_add$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode ajustar o pricing';
  end if;

  insert into public.proposal_items
    (proposal_id, grupo, codigo, componente, unidade, quantidade,
     preco_cliente_unit, repasse_unit, repasse_teto, subtotal_cliente, subtotal_repasse)
  values
    (p_proposal_id, 'extra', 'manual', p_componente, coalesce(p_unidade, 'job'),
     greatest(coalesce(p_quantidade, 1), 0),
     greatest(coalesce(p_preco_cliente_unit, 0), 0),
     greatest(coalesce(p_repasse_unit, 0), 0),
     -- linha manual: o teto e o proprio repasse digitado
     greatest(coalesce(p_repasse_unit, 0), 0),
     greatest(coalesce(p_quantidade, 1), 0) * greatest(coalesce(p_preco_cliente_unit, 0), 0),
     greatest(coalesce(p_quantidade, 1), 0) * greatest(coalesce(p_repasse_unit, 0), 0))
  returning id into v_id;

  perform public.rpc_salvar_pricing(p_proposal_id, '[]'::jsonb);
  return v_id;
end
$fn_add$;

create or replace function public.rpc_remover_item_pricing(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_del$
declare
  v_proposal uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode ajustar o pricing';
  end if;
  select proposal_id into v_proposal from public.proposal_items where id = p_item_id;
  if v_proposal is null then
    raise exception 'Item nao encontrado';
  end if;
  delete from public.proposal_items where id = p_item_id;
  perform public.rpc_salvar_pricing(v_proposal, '[]'::jsonb);
end
$fn_del$;

-- 7) Aprovar / reabrir ---------------------------------------------------
create or replace function public.rpc_aprovar_pricing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_ok$
declare
  v_cli numeric;
  v_rep numeric;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode aprovar o pricing';
  end if;

  select coalesce(sum(subtotal_cliente), 0), coalesce(sum(subtotal_repasse), 0)
    into v_cli, v_rep
    from public.proposal_items where proposal_id = p_proposal_id;

  if v_cli <= 0 then
    raise exception 'Orcamento sem valor: nao da para aprovar';
  end if;

  update public.proposals
     set total_cliente        = v_cli,
         total_repasse        = v_rep,
         margem_ruche         = v_cli - v_rep,
         pricing_status       = 'aprovado',
         pricing_aprovado_em  = now(),
         pricing_aprovado_por = auth.uid(),
         stage                = case when stage = 'pricing_review' then 'negotiation' else stage end,
         updated_at           = now()
   where id = p_proposal_id;
end
$fn_ok$;

-- Volta o orcamento para o motor, descartando os ajustes manuais.
create or replace function public.rpc_resetar_pricing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn_reset$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ruche') then
    raise exception 'Apenas Ruche pode resetar o pricing';
  end if;
  update public.proposals
     set pricing_status = 'auto', pricing_aprovado_em = null, pricing_aprovado_por = null
   where id = p_proposal_id;
  perform public.rpc_calcular_proposta(p_proposal_id);
  perform public.rpc_seed_servicos(p_proposal_id);
end
$fn_reset$;

-- 8) Grants --------------------------------------------------------------
-- Funcao nova nasce com execute para PUBLIC; como estas sao SECURITY DEFINER
-- e tratam auth.uid() nulo como chamada de servidor, PUBLIC aqui seria um
-- buraco. Revoga e libera so para quem esta logado.
do $fn_grants$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_recalcular_se_auto(uuid)',
    'public.rpc_seed_servicos(uuid)',
    'public.rpc_salvar_pricing(uuid, jsonb)',
    'public.rpc_adicionar_item_pricing(uuid, text, text, numeric, numeric, numeric)',
    'public.rpc_remover_item_pricing(uuid)',
    'public.rpc_aprovar_pricing(uuid)',
    'public.rpc_resetar_pricing(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$fn_grants$;

commit;

-- Conferencia ------------------------------------------------------------
-- select id, stage, pricing_status, total_cliente, total_repasse
--   from public.proposals order by updated_at desc limit 10;
