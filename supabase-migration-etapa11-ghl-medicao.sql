-- Etapa 11: manda a medição campo a campo pro GHL (em vez de só o resumo em texto)
-- Idempotente: pode rodar mais de uma vez.
--
-- Corrige de quebra 2 colunas que o código já lê mas nenhuma migration criou:
--   assigned_partner_field_id  (admin-create-user/index.ts:112 e ghl-sync provision_partner)
--   measurements_done_stage_id (ghl-sync/index.ts:187)

alter table public.ghl_pipeline_config
  add column if not exists assigned_partner_field_id  text,
  add column if not exists measurements_done_stage_id text,
  -- mapa chave -> id do custom field de opportunity no GHL.
  -- jsonb em vez de 1 coluna por campo: campo novo na medição não vira migration.
  add column if not exists measurement_field_ids jsonb not null default '{}'::jsonb,
  -- id do custom field de CONTACT que recebe o escopo pro contrato.
  add column if not exists contact_scope_field_id text,
  add column if not exists contact_sqft_field_id  text,
  add column if not exists contact_total_field_id text;

-- Seed da location do piloto (Flooring FL).
update public.ghl_pipeline_config
set
  measurement_field_ids = '{
    "sqft_real":              "Z8MDdI8yaftNX77smeej",
    "piso_atual":             "uo6y4CwGV0nFKwCJd482",
    "subfloor":               "4UuOt9tbGnAWs6Fw2k5Z",
    "nivelamento_necessario": "akeX8KCHVzKkxivtNHyt",
    "umidade_ok":             "U7qTZ7XcBeAQgBbizH7Z",
    "observacoes":            "Zg5Iz4FqXYu8lKxn4xBk",
    "medicao_at":             "50KWoi7e6x4msXNe3doj",
    "total_cliente":          "mc8HR0AUVQPqFoxJtk7P",
    "total_repasse":          "tkcSvNd7jRjO4utFN2AQ",
    "margem_ruche":           "tC6HQ6VvLy3YMKLy2747",
    "ambientes":              "Ff5xNbmIIEHxdpCi79Xw",
    "extras":                 "LVWLBnKBHZCO2ppR2V1j"
  }'::jsonb,
  contact_scope_field_id     = 'QG7UEkMV4bnMt5BqF40Y',  -- contact.scope_of_work_contrato
  contact_sqft_field_id      = '6YW0ZcfdHFk369qAosCT',  -- contact.total_sqft
  contact_total_field_id     = 'JaghQ5LnF76I1bOInGib',  -- contact.contract_total
  assigned_partner_field_id  = 'LsnKlq8RoLPKWiSqUlec',  -- opportunity.assigned_partner
  measurements_done_stage_id = '439c2c18-7363-4a70-b054-bd4c7a532c5d', -- 📐 ✅ Measurements Done
  updated_at = now()
where location_id = 'jl5iFelWb5hiWu9FIeiD';

-- Confere se a linha da location existe (o update acima é no-op se não existir).
do $$
begin
  if not exists (select 1 from public.ghl_pipeline_config where location_id = 'jl5iFelWb5hiWu9FIeiD') then
    raise warning 'Nenhuma linha em ghl_pipeline_config para jl5iFelWb5hiWu9FIeiD — o seed nao foi aplicado.';
  end if;
end $$;
