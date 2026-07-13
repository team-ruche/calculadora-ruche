## Calculadora de Orçamento — Ruche Digital

Web app em português (valores USD) para orçamentos de flooring/home improvement, com múltiplos parceiros, papéis (ruche/parceiro), RLS e exportação PDF.

**Stack**
- React + TanStack Start (template atual) + Tailwind
- Supabase externo fornecido: `qrdbqpsqohalitaaxhnx.supabase.co` (Auth + Postgres + RLS)
- Design inspirado no print anexo: sidebar escura, acento dourado/âmbar, cards claros com bordas suaves, tipografia limpa
- PDF client-side (jspdf + html2canvas)

**Modelo de dados**
- `users` (id=auth.users.id, nome, email, telefone, role enum ruche|parceiro, status enum pendente|aprovado)
- `user_roles` (padrão seguro Lovable, com enum `app_role` e `has_role()` SECURITY DEFINER — evita recursão em RLS)
- `leads` (nome_cliente, telefone, endereco, email, partner_id, etapa_funil, created_at)
- `proposals` (lead_id, partner_id, status, total_cliente, total_repasse, margem_ruche, timestamps)
- `proposal_items` (proposal_id, grupo, componente, unidade, quantidade, preco_cliente_unit, repasse_unit, subtotais)
- `motor_prices` (grupo, componente, unidade, preco_cliente, repasse_partida, teto_repasse, ativo) — seed com tabelas do prompt

**RLS resumo**
- Parceiro: SELECT/INSERT/UPDATE apenas onde `partner_id = auth.uid()` em leads/proposals/proposal_items
- Ruche (via `has_role(auth.uid(),'ruche')`): acesso total
- `motor_prices`: leitura para autenticados; escrita só ruche
- `users`: leitura do próprio registro; ruche lê/edita todos; aprovação = `status='aprovado'`

**Design system (definido em `src/styles.css`)**
- Cores oklch: bg claro creme, sidebar quase-preta, primary âmbar/dourado (~oklch(0.82 0.15 85)), texto foreground escuro
- Radius 0.75rem, sombras suaves, tokens para sidebar (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`)
- Sem cores hard-coded nos componentes; usar variantes shadcn

**Etapas incrementais (pausa para revisão ao fim de cada uma)**

1. **Auth + Usuários + Papéis + RLS + Layout base**
   - Conectar Supabase externo (client em `src/integrations/supabase/client.ts`)
   - Rota `/auth` (login + cadastro; novos entram como `pendente`)
   - Layout com sidebar (Overview, Leads, Motor, Tracker, Usuários) — itens filtrados por papel
   - Rota `_authenticated` gate + bloqueio se `status != aprovado` (tela "Aguardando aprovação")
   - Migração SQL: enum `app_role`, tabela `users`, `user_roles`, `has_role()`, seed do papel ruche para primeiro admin (email fornecido depois, ou promoção manual)
   - Aba **Usuários** só shell + listagem (aprovação real vem em outra etapa? — não, aprovação simples já entra aqui pois é curta)

2. **Aba Input** (formulário lead + ambientes repetíveis + extras; salva `lead` e cria `proposal` rascunho)

3. **Aba Motor + lógica de cálculo** (CRUD motor_prices para ruche; função de cálculo que popula `proposal_items`)

4. **Aba Orçamento Cliente + Export PDF**

5. **Aba Visão Interna** (repasse por item ajustável entre partida e teto, margem)

6. **Aba Tracker** (kanban drag-and-drop por `etapa_funil`, métricas)

7. **Polimento Usuários + filtros globais** (data, lead, parceiro)

**Nesta rodada implemento apenas a Etapa 1.** Depois paro para você revisar antes de seguir.

### Notas técnicas
- Uso Supabase externo do usuário (não Lovable Cloud) porque credenciais foram fornecidas explicitamente. Client browser-only com anon key em `import.meta.env` via `.env` local — armazenarei via secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
- Como é Supabase externo (não gerenciado), server functions com `requireSupabaseAuth` não aplicam; toda leitura/escrita via client browser com RLS. Sem SSR de dados autenticados.
- Migrações SQL serão executadas via `psql` (chaves fornecidas apenas anon — precisarei que você rode os SQLs no dashboard **ou** me dê a service_role. Caso contrário, entrego os arquivos `.sql` para você aplicar).

**Pergunta antes de codar**: como aplico as migrações? (a) você cola o SQL no SQL Editor do Supabase; (b) me passa a `service_role` como secret. E qual e-mail deve virar o primeiro `ruche`?
