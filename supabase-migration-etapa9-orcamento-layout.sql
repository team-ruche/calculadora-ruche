-- Etapa 9: template de orçamento por parceiro (identidade visual + seções)

create table if not exists public.partner_orcamento_layout (
  partner_id uuid primary key references public.users(id) on delete cascade,
  logo_url text,
  empresa text,
  slogan text,
  titulo text default 'Orçamento',
  cor1 text default '#1D9E75',
  cor2 text default '#1A1A1A',
  telefone text,
  site text,
  instagram text,
  endereco text,
  email text,
  license text,
  hic text,
  secoes jsonb not null default '[
    {"id":"capa","tipo":"sistema","label":"Cabeçalho","on":true},
    {"id":"titulo","tipo":"sistema","label":"Título do documento","on":true},
    {"id":"partes","tipo":"sistema","label":"Cliente / Projeto","on":true},
    {"id":"foto","tipo":"sistema","label":"Foto do projeto","on":true},
    {"id":"escopo","tipo":"sistema","label":"Escopo / ambientes","on":true},
    {"id":"itens","tipo":"sistema","label":"Itens e preços","on":true},
    {"id":"termos","tipo":"sistema","label":"Termos e condições","on":true}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.partner_orcamento_layout enable row level security;

drop policy if exists "layout_select" on public.partner_orcamento_layout;
create policy "layout_select" on public.partner_orcamento_layout
  for select to authenticated
  using (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

drop policy if exists "layout_write" on public.partner_orcamento_layout;
create policy "layout_write" on public.partner_orcamento_layout
  for all to authenticated
  using (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'))
  with check (partner_id = auth.uid() or public.has_role(auth.uid(), 'ruche'));

-- Snapshot do layout no momento em que o orçamento foi gerado.
alter table public.proposals
  add column if not exists orcamento_layout jsonb;

-- Bucket público para as logos dos parceiros.
insert into storage.buckets (id, name, public)
values ('partner-logos', 'partner-logos', true)
on conflict (id) do nothing;

drop policy if exists "logos_read" on storage.objects;
create policy "logos_read" on storage.objects
  for select to public using (bucket_id = 'partner-logos');

drop policy if exists "logos_write" on storage.objects;
create policy "logos_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'partner-logos');

drop policy if exists "logos_update" on storage.objects;
create policy "logos_update" on storage.objects
  for update to authenticated using (bucket_id = 'partner-logos');

drop policy if exists "logos_delete" on storage.objects;
create policy "logos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'partner-logos');
