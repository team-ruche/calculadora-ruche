-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 3: Motor de Preços (motor_prices) + seed
-- `codigo` casa com os enums de proposal_rooms / colunas de proposal_extras,
-- para a lógica de cálculo (Etapa 3b) fazer o join sem ambiguidade.
-- Idempotente.
-- ============================================================

create table if not exists public.motor_prices (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('instalacao','demolicao','prep','extra')),
  codigo text not null,
  componente text not null,
  unidade text not null,
  preco_cliente numeric not null default 0 check (preco_cliente >= 0),
  repasse_partida numeric not null default 0 check (repasse_partida >= 0),
  teto_repasse numeric not null default 0 check (teto_repasse >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (grupo, codigo)
);

alter table public.motor_prices enable row level security;

grant select, insert, update, delete on public.motor_prices to authenticated;
grant all on public.motor_prices to service_role;

-- leitura: qualquer autenticado (parceiro precisa ver preço cliente); escrita: só ruche
drop policy if exists "motor_prices_read" on public.motor_prices;
create policy "motor_prices_read" on public.motor_prices for select to authenticated
  using (true);

drop policy if exists "motor_prices_ruche_write" on public.motor_prices;
create policy "motor_prices_ruche_write" on public.motor_prices for all to authenticated
  using (public.has_role(auth.uid(), 'ruche'))
  with check (public.has_role(auth.uid(), 'ruche'));

-- Seed (calculadora.md secção 6). on conflict: não sobrescreve preços já ajustados.
insert into public.motor_prices (grupo, codigo, componente, unidade, preco_cliente, repasse_partida, teto_repasse) values
  -- Instalação ($/sqft — por piso novo)
  ('instalacao','vinyl_lvp','Vinyl/LVP','sqft',2.50,1.25,1.50),
  ('instalacao','laminado','Laminado','sqft',2.50,1.25,1.50),
  ('instalacao','hardwood','Hardwood','sqft',3.00,1.50,2.25),
  ('instalacao','tile','Tile','sqft',5.50,3.00,4.00),
  ('instalacao','refinish','Refinish','sqft',5.00,2.50,4.00),
  ('instalacao','unfinished','Unfinished','sqft',4.50,2.00,2.00),
  -- Demolição / Remoção ($/sqft — por piso atual)
  ('demolicao','carpete','Carpete','sqft',0.00,0.00,0.00),
  ('demolicao','vinyl_lvp','Vinyl/LVP','sqft',1.00,0.50,0.50),
  ('demolicao','laminado','Laminado','sqft',1.00,0.50,0.50),
  ('demolicao','hardwood','Hardwood','sqft',3.25,1.50,2.50),
  ('demolicao','tile','Tile','sqft',3.25,1.50,2.50),
  ('demolicao','concreto_exposto','Concreto exposto','sqft',0.00,0.00,0.00),
  -- Preparação ($/sqft)
  ('prep','simples','Prep simples','sqft',1.70,0.70,0.70),
  ('prep','pesada','Prep pesada','sqft',2.70,1.70,1.70),
  -- Extras (provisório — validar em campo)
  ('extra','degraus_escada','Escada','degrau',60.00,30.00,30.00),
  ('extra','baseboard_instalar_ft','Baseboard instalar','linear ft',3.00,1.50,1.50),
  ('extra','baseboard_pintar_ft','Baseboard pintar','linear ft',1.50,0.75,0.75),
  ('extra','quarter_round_ft','Quarter round','linear ft',3.00,1.00,1.00),
  ('extra','transicoes','Transição','unidade',30.00,15.00,15.00),
  ('extra','ambientes_moveis','Móveis','ambiente',50.00,25.00,25.00),
  ('extra','aparelhos_mover','Aparelho a mover','unidade',50.00,25.00,25.00),
  ('extra','segundo_andar_sem_elevador','Adicional 2º andar s/ elevador','flat',150.00,75.00,75.00),
  ('extra','portas_trim','Door trimming','porta',25.00,12.00,12.00)
on conflict (grupo, codigo) do nothing;
