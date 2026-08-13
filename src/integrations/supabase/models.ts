// Client Supabase + modelos de domínio da Ruche.
// IMPORTANTE: o client é criado AQUI, fixo no projeto original, de propósito.
// O Lovable Cloud fica trocando o .env/client.ts para um projeto novo e vazio,
// o que derruba o login. Este arquivo não é regenerado pelo Lovable, então
// mantém o app sempre no projeto onde estão as contas e os dados.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qrdbqpsqohalitaaxhnx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZGJxcHNxb2hhbGl0YWF4aG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzE5MjUsImV4cCI6MjA5OTU0NzkyNX0.OU6GEU98LZtgn5ln6XpJeW1F4fLs4XpB5Mp_vjgeoLo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// Sync GHL — chama a Edge Function ghl-sync (que repassa pro n8n, ver
// supabase/functions/ghl-sync). O client já anexa o JWT da sessão atual.
export async function callGhlSync(
  action: "cancel_appointment" | "push_quote_ready",
  proposalId: string,
) {
  const { data, error } = await supabase.functions.invoke("ghl-sync", {
    body: { action, proposal_id: proposalId },
  });
  // O invoke devolve erro generico ("non-2xx status") e joga o corpo pra data.
  // Sem desempacotar, todo problema vira a mesma mensagem inutil na tela.
  const detalhe = (data as { error?: string; detail?: string } | null) ?? null;
  if (error || detalhe?.error) {
    const alvo = `${detalhe?.detail ?? ""} ${detalhe?.error ?? ""}`;
    // O 404 do GHL e o caso comum: o contato ou a oportunidade foi apagado la,
    // e o lead daqui ficou apontando pro vazio. Vale dizer isso, nao "verifique".
    if (/not found|OPPORTUNITY_NOT_FOUND/i.test(alvo)) {
      throw new Error("Este lead não existe mais no GHL — contato ou oportunidade foi apagado lá.");
    }
    throw new Error(detalhe?.error ?? error?.message ?? "Falha ao falar com o GHL");
  }
}

// Cria a opção do parceiro no dropdown "Assigned Partner" do GHL + a linha
// em ghl_partner_map. Chamar quando um parceiro é aprovado/criado.
export async function callGhlSyncPartner(partnerUserId: string) {
  const { error } = await supabase.functions.invoke("ghl-sync", {
    body: { action: "provision_partner", partner_user_id: partnerUserId },
  });
  if (error) throw error;
}

export type AppRole = "ruche" | "parceiro";
export type UserStatus = "pendente" | "aprovado" | "reprovado";

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  pendente: "Pending",
  aprovado: "Approved",
  reprovado: "Rejected",
};

export type AppRoleLabel = "ruche" | "parceiro";
export const ROLE_LABEL: Record<AppRoleLabel, string> = {
  ruche: "Ruche",
  parceiro: "Partner",
};

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: AppRole;
  status: UserStatus;
  // Dados do parceiro
  nicho: string | null;
  endereco_empresa: string | null;
  ein: string | null;
  // Força troca de senha no 1º acesso.
  must_change_password: boolean;
  created_at: string;
}

export type PisoTipo =
  | "vinyl_lvp"
  | "laminado"
  | "hardwood"
  | "tile"
  | "refinish"
  | "unfinished"
  | "carpete"
  | "concreto_exposto";

export type PreparoNivel = "nenhuma" | "simples" | "pesada";

export interface Lead {
  id: string;
  partner_id: string;
  nome_cliente: string;
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  etapa_funil: string;
  // Qualificação do setter (grupos A–F). Vem pré-preenchida da integração GHL.
  qualificacao: LeadQualificacao | null;
  ghl_contact_id: string | null;
  created_at: string;
}

// Estágios do kanban do Overview.
export type ProposalStage =
  "appointment_confirmed" | "appointment_canceled" | "negotiation" | "no_deal" | "deal";

export const STAGE_LABEL: Record<ProposalStage, string> = {
  appointment_confirmed: "Appointment Confirmed",
  appointment_canceled: "Appointment Canceled",
  negotiation: "Negotiation",
  no_deal: "No Deal",
  deal: "Deal",
};

export const STAGE_ORDER: ProposalStage[] = [
  "appointment_confirmed",
  "appointment_canceled",
  "negotiation",
  "no_deal",
  "deal",
];

// Status do contrato (Controle Financeiro)
export type ContractStatus = "active" | "pending" | "on_hold" | "contractual_billing" | "encerrado";

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  active: "Active",
  pending: "Pending",
  on_hold: "On Hold",
  contractual_billing: "Contractual Billing",
  encerrado: "Closed",
};

// Status de uma parcela
export type ParcelaStatus =
  "pago" | "em_dia" | "vence_7d" | "vence_hoje" | "em_atraso" | "negociacao" | "processing";

export const PARCELA_STATUS_LABEL: Record<ParcelaStatus, string> = {
  pago: "Paid",
  em_dia: "On time",
  vence_7d: "Due in 7d",
  vence_hoje: "Due today",
  em_atraso: "Overdue",
  negociacao: "Negotiation",
  processing: "Processing",
};

export const PAYMENT_METHODS = [
  "Agreement",
  "Auto Pay",
  "Credit Card",
  "Debit Card",
  "Fatura",
  "PayPal",
  "Pix",
  "Wire Transfer",
  "Zelle",
] as const;

export const CONTAS = ["WISE", "Asaas"] as const;

export type Direcao = "inflow" | "outflow";

// Uma linha do cronograma de pagamento do contrato. Quem define e o closer,
// na Sales Call — nao ha 30/40/30 fixo.
export interface PaymentScheduleEntry {
  pct: number;
  label: string;
}

// Gera as parcelas a partir do cronograma ja gravado na proposta. A RPC recusa
// se nao houver cronograma, se a soma nao der 100, ou se alguma parcela ja
// tiver movimento. Retorna quantas parcelas criou.
export async function gerarParcelas(proposalId: string): Promise<number> {
  const { data, error } = await supabase.rpc("rpc_gerar_parcelas", {
    p_proposal_id: proposalId,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export interface Parcela {
  id: string;
  proposal_id: string;
  numero: number;
  date_added: string;
  payment_method: string | null;
  conta: string | null;
  categoria: string | null;
  direcao: Direcao;
  periodo: string | null;
  valor: number;
  valor_parceiro: number | null;
  valor_ruche: number | null;
  vencimento: string | null;
  data_pagamento: string | null;
  valor_pago: number | null;
  status: ParcelaStatus;
  conciliado: boolean;
  invoice_gerada: boolean;
  valor_nativo: number | null;
  moeda_nativa: string | null;
  notas: string | null;
  // Modelo de repasse (etapa 13): o parceiro recebe do cliente e repassa a
  // margem pra Ruche. Uma parcela tem DOIS eventos:
  //   cliente_pagou_em -> quando o cliente pagou o parceiro (auto-declarado)
  //   data_pagamento   -> quando a Ruche recebeu o repasse
  // O prazo corre a partir do primeiro; vencimento = +repasse_prazo_dias uteis.
  cliente_pagou_em: string | null;
  comprovante_url: string | null;
  repasse_prazo_dias: number;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  lead_id: string;
  partner_id: string;
  status: string;
  // Kanban
  stage: ProposalStage;
  contract_status: ContractStatus;
  visita_at: string | null;
  fechado_at: string | null;
  // O que o parceiro mede fica em proposal_rooms, proposal_extras e notas.
  // As colunas medicao / medicao_preenchida / medicao_at existem no banco
  // desde a etapa 5 mas NUNCA foram escritas pelo app — o único dado nelas
  // veio do seed de exemplo. Ficam fora do tipo para ninguém ler achando que
  // têm conteúdo. O portão para ir a Negotiation usa total_cliente.
  total_cliente: number | null;
  total_repasse: number | null;
  margem_ruche: number | null;
  // Notas gerais da medição (texto livre).
  notas: string | null;
  // Cronograma de pagamento negociado pelo closer, digitado no GHL e trazido
  // pelo ghl-sync-inbound ao fechar. Nao ha default: sem isso, gerar parcelas
  // e recusado. Os percentuais somam 100.
  payment_schedule: PaymentScheduleEntry[] | null;
  // Snapshot do layout do orçamento (congelado ao gerar).
  orcamento_layout: OrcamentoLayout | null;
  // Sync GHL — ver supabase-migration-etapa10-ghl-sync.sql
  ghl_opportunity_id: string | null;
  location_id: string | null;
  last_ghl_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

// Qualificação do setter — grupos A a F do formulário de discovery (GHL).
export interface LeadQualificacao {
  // A — Contato
  a_nome?: string;
  a_telefone?: string;
  a_email?: string;
  a_endereco?: string;
  a_fonte?: string;
  // B — Elegibilidade
  b_dono?: boolean;
  b_zip_area?: boolean;
  b_tipo_imovel?: string;
  b_sqft_estimado?: number;
  // C — Motivação
  c_motivo?: string;
  c_reforma_maior?: boolean;
  c_quem_mora?: string;
  c_data_limite?: string;
  // D — Escopo
  d_ambientes?: string[];
  d_sqft_total?: number;
  d_piso_atual?: string;
  d_piso_desejado?: string;
  d_material_comprado?: string;
  d_cor_estilo?: string;
  d_servico?: string;
  // E — Dinheiro e concorrência
  e_budget?: string;
  e_pagamento?: string;
  e_outros_orcamentos?: string;
  // F — Decisão e agendamento
  f_decisores?: string;
  f_decisores_confirmados?: boolean;
  f_temperatura?: number;
  f_observacoes?: string;
  // F5 do doc do setter: canal preferido + consentimento de SMS (CHECKBOX no
  // GHL, entao vem como lista). O consentimento importa por TCPA, nao e so
  // preferencia de contato.
  f_canal_sms?: string[];
}

export interface ProposalRoom {
  id: string;
  proposal_id: string;
  nome: string;
  area_sqft: number;
  // Agora texto livre (codigo de motor_prices) — subcategorias dinâmicas
  piso_novo: string;
  piso_atual: string;
  preparo: string;
  created_at: string;
}

export interface ProposalExtras {
  proposal_id: string;
  degraus_escada: number;
  baseboard_instalar_ft: number;
  baseboard_pintar_ft: number;
  quarter_round_ft: number;
  transicoes: number;
  ambientes_moveis: number;
  aparelhos_mover: number;
  segundo_andar_sem_elevador: boolean;
  portas_trim: number;
}

export interface ProposalRoomMedia {
  id: string;
  room_id: string;
  proposal_id: string;
  url: string;
  path: string;
  mime: string | null;
  created_at: string;
}

export type MotorGrupo = "instalacao" | "demolicao" | "prep" | "extra";

export interface ProposalItem {
  id: string;
  proposal_id: string;
  grupo: MotorGrupo;
  codigo: string;
  componente: string;
  unidade: string;
  quantidade: number;
  preco_cliente_unit: number;
  repasse_unit: number;
  repasse_teto: number;
  subtotal_cliente: number;
  subtotal_repasse: number;
  created_at: string;
}

// ---- Template de orçamento por parceiro ------------------------------------
export type OrcSecaoTipo = "sistema" | "custom";

export interface OrcSecao {
  id: string;
  tipo: OrcSecaoTipo;
  label: string;
  on: boolean;
  title?: string;
  body?: string;
}

export interface OrcamentoLayout {
  partner_id: string;
  logo_url: string | null;
  empresa: string | null;
  slogan: string | null;
  titulo: string | null;
  cor1: string;
  cor2: string;
  telefone: string | null;
  site: string | null;
  instagram: string | null;
  endereco: string | null;
  email: string | null;
  license: string | null;
  hic: string | null;
  secoes: OrcSecao[];
  updated_at: string;
}

export const DEFAULT_SECOES: OrcSecao[] = [
  { id: "capa", tipo: "sistema", label: "Cabeçalho", on: true },
  { id: "titulo", tipo: "sistema", label: "Título do documento", on: true },
  { id: "partes", tipo: "sistema", label: "Cliente / Projeto", on: true },
  { id: "foto", tipo: "sistema", label: "Foto do projeto", on: true },
  { id: "escopo", tipo: "sistema", label: "Escopo / ambientes", on: true },
  { id: "itens", tipo: "sistema", label: "Itens e preços", on: true },
  { id: "termos", tipo: "sistema", label: "Termos e condições", on: true },
];

export const defaultLayout = (partnerId: string): OrcamentoLayout => ({
  partner_id: partnerId,
  logo_url: null,
  empresa: null,
  slogan: null,
  titulo: "Orçamento",
  cor1: "#1D9E75",
  cor2: "#1A1A1A",
  telefone: null,
  site: null,
  instagram: null,
  endereco: null,
  email: null,
  license: null,
  hic: null,
  secoes: DEFAULT_SECOES,
  updated_at: new Date().toISOString(),
});

export interface MotorPrice {
  id: string;
  grupo: MotorGrupo;
  codigo: string;
  componente: string;
  unidade: string;
  preco_cliente: number;
  repasse_partida: number;
  teto_repasse: number;
  ativo: boolean;
  created_at: string;
}
