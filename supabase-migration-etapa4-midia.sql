-- ============================================================
-- Ruche Digital — Calculadora de Orçamento
-- Etapa 4 (mídia): bucket público + tabela proposal_room_media
-- Fotos/vídeos por ambiente. Bucket público (acesso por URL direta).
-- Idempotente.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('proposal-media', 'proposal-media', true)
on conflict (id) do update set public = true;

-- Leitura pública; escrita/deleção por usuários autenticados.
drop policy if exists "proposal_media_public_read" on storage.objects;
create policy "proposal_media_public_read" on storage.objects for select
  using (bucket_id = 'proposal-media');

drop policy if exists "proposal_media_auth_insert" on storage.objects;
create policy "proposal_media_auth_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'proposal-media');

drop policy if exists "proposal_media_auth_delete" on storage.objects;
create policy "proposal_media_auth_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'proposal-media');

-- Metadados da mídia por ambiente
create table if not exists public.proposal_room_media (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.proposal_rooms(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  url text not null,
  path text not null,
  mime text,
  created_at timestamptz not null default now()
);

create index if not exists proposal_room_media_room_idx on public.proposal_room_media(room_id);

alter table public.proposal_room_media enable row level security;

grant select, insert, delete on public.proposal_room_media to authenticated;
grant all on public.proposal_room_media to service_role;

drop policy if exists "prm_via_proposal" on public.proposal_room_media;
create policy "prm_via_proposal" on public.proposal_room_media for all to authenticated
  using (exists (select 1 from public.proposals p where p.id = proposal_room_media.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))))
  with check (exists (select 1 from public.proposals p where p.id = proposal_room_media.proposal_id
    and (p.partner_id = auth.uid() or public.has_role(auth.uid(),'ruche'))));
