-- Seed: 6 cards de exemplo para o kanban do Overview
-- Rodar DEPOIS da migration etapa5. Idempotente: limpa os exemplos antigos
-- (email @exemplo.ruche) antes de reinserir.
-- Distribuição: 2 Appointment Confirmed · 1 Appointment Canceled · 1 Negotiation · 2 Deal
-- As visitas ficam em julho/2026 para aparecerem no filtro "Este mês".

do $$
declare
  v_partner uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid;
begin
  -- Escolhe um usuário para dono dos cards (prioriza Ruche).
  select coalesce(
    (select id from public.users where role = 'ruche' order by created_at limit 1),
    (select id from public.users order by created_at limit 1)
  ) into v_partner;

  if v_partner is null then
    raise exception 'Nenhum usuário em public.users — crie/aprove um usuário antes de rodar o seed.';
  end if;

  -- Limpa exemplos anteriores.
  delete from public.proposals
    where lead_id in (select id from public.leads where email like '%@exemplo.ruche');
  delete from public.leads where email like '%@exemplo.ruche';

  -- ---- Leads (com qualificação A–F pré-preenchida) --------------------------
  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'Gregory Adams', '+13055550111', '4210 NW 7th St, Miami FL 33126', 'gregory@exemplo.ruche',
      '{"a_fonte":"WPP Funnel Booking Calendar","b_dono":true,"b_tipo_imovel":"casa","b_sqft_estimado":1200,"c_motivo":"estetica-reforma","c_data_limite":"2026-09-01","d_ambientes":["sala","cozinha"],"d_sqft_total":1150,"d_piso_atual":"carpete","d_piso_desejado":"vinyl_lvp","d_servico":"troca","e_budget":"$5-10k","e_pagamento":"a vista","f_temperatura":4}')
    returning id into l1;

  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'Maria Santos', '+13055550122', '881 Brickell Ave, Miami FL 33131', 'maria@exemplo.ruche',
      '{"a_fonte":"Meta Ads","b_dono":true,"b_tipo_imovel":"townhouse","b_sqft_estimado":900,"c_motivo":"casa recem-comprada","d_ambientes":["quartos"],"d_sqft_total":850,"d_piso_atual":"tile","d_piso_desejado":"laminado","d_servico":"instalacao nova","e_budget":"$3-5k","e_pagamento":"cartao","f_temperatura":3}')
    returning id into l2;

  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'John Carter', '+13055550133', '120 SW 8th St, Miami FL 33130', 'john@exemplo.ruche',
      '{"a_fonte":"Google LSA","b_dono":true,"b_tipo_imovel":"condo","c_motivo":"vai vender","d_ambientes":["sala"],"d_sqft_total":600,"e_budget":"nao definiu","f_temperatura":2}')
    returning id into l3;

  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'Emily Nguyen', '+13055550144', '55 NE 5th Ave, Fort Lauderdale FL 33301', 'emily@exemplo.ruche',
      '{"a_fonte":"WPP Funnel","b_dono":true,"b_tipo_imovel":"casa","b_sqft_estimado":1400,"c_motivo":"dano-infiltracao","c_data_limite":"2026-08-15","d_ambientes":["sala","corredor","quartos"],"d_sqft_total":1380,"d_piso_atual":"hardwood","d_piso_desejado":"hardwood","d_servico":"refinish","e_budget":"$10k+","e_pagamento":"a vista","f_temperatura":5}')
    returning id into l4;

  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'Robert King', '+13055550155', '900 Biscayne Blvd, Miami FL 33132', 'robert@exemplo.ruche',
      '{"a_fonte":"Referral","b_dono":true,"b_tipo_imovel":"casa","b_sqft_estimado":1600,"c_motivo":"pet","d_ambientes":["casa toda"],"d_sqft_total":1620,"d_piso_atual":"carpete","d_piso_desejado":"vinyl_lvp","d_servico":"troca","e_budget":"$10k+","e_pagamento":"cartao","f_temperatura":5}')
    returning id into l5;

  insert into public.leads (partner_id, nome_cliente, telefone, endereco, email, qualificacao)
  values
    (v_partner, 'Laura Mendes', '+13055550166', '2100 Coral Way, Miami FL 33145', 'laura@exemplo.ruche',
      '{"a_fonte":"Instagram","b_dono":true,"b_tipo_imovel":"townhouse","b_sqft_estimado":1050,"c_motivo":"estetica-reforma","d_ambientes":["sala","cozinha"],"d_sqft_total":1020,"d_piso_atual":"laminado","d_piso_desejado":"vinyl_lvp","d_servico":"troca","e_budget":"$5-10k","e_pagamento":"a vista","f_temperatura":4}')
    returning id into l6;

  -- ---- Proposals (os cards do kanban) --------------------------------------
  -- 2x Appointment Confirmed (sem valor ainda — total após orçamento)
  insert into public.proposals (lead_id, partner_id, stage, visita_at)
  values
    (l1, v_partner, 'appointment_confirmed', '2026-07-30 14:00:00-04'),
    (l2, v_partner, 'appointment_confirmed', '2026-07-29 10:00:00-04');

  -- 1x Appointment Canceled
  insert into public.proposals (lead_id, partner_id, stage, visita_at)
  values
    (l3, v_partner, 'appointment_canceled', '2026-07-27 09:00:00-04');

  -- 1x Negotiation (medição preenchida + valor em negociação)
  insert into public.proposals
    (lead_id, partner_id, stage, visita_at, medicao_preenchida, medicao, medicao_at, total_cliente)
  values
    (l4, v_partner, 'negotiation', '2026-07-22 15:00:00-04', true,
      '{"sqft_real":1380,"piso_atual":"hardwood","subfloor":"plywood","nivelamento_necessario":false,"umidade_ok":true,"observacoes":"Refinish, sem troca de tabua."}',
      '2026-07-22 16:30:00-04', 12800);

  -- 2x Deal (fechados em julho — entram em "venda fechada")
  insert into public.proposals
    (lead_id, partner_id, stage, visita_at, medicao_preenchida, medicao, medicao_at, total_cliente, fechado_at)
  values
    (l5, v_partner, 'deal', '2026-07-15 11:00:00-04', true,
      '{"sqft_real":1620,"piso_atual":"carpete","subfloor":"concreto","nivelamento_necessario":true,"umidade_ok":true,"observacoes":"Nivelar cozinha."}',
      '2026-07-15 12:00:00-04', 9600, '2026-07-20 18:00:00-04'),
    (l6, v_partner, 'deal', '2026-07-10 13:00:00-04', true,
      '{"sqft_real":1020,"piso_atual":"laminado","subfloor":"plywood","nivelamento_necessario":false,"umidade_ok":true,"observacoes":"Job limpo."}',
      '2026-07-10 14:00:00-04', 6200, '2026-07-24 17:00:00-04');
end $$;
