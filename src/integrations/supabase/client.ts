import { createClient } from "@supabase/supabase-js";

// Publishable anon key — safe to expose in browser code.
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
  const { error } = await supabase.functions.invoke("ghl-sync", {
    body: { action, proposal_id: proposalId },
  });
  if (error) throw error;
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
  encerrado: "Encerrado",
};

// Status de uma parcela
export type ParcelaStatus =
  "pago" | "em_dia" | "vence_7d" | "vence_hoje" | "em_atraso" | "negociacao" | "processing";

export const PARCELA_STATUS_LABEL: Record<ParcelaStatus, string> = {
  pago: "Pago",
  em_dia: "Em dia",
  vence_7d: "Vence 7d",
  vence_hoje: "Vence hoje",
  em_atraso: "Em atraso",
  negociacao: "Negociação",
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
  // Gate da medição
  medicao_preenchida: boolean;
  medicao: MedicaoData | null;
  medicao_at: string | null;
  total_cliente: number | null;
  total_repasse: number | null;
  margem_ruche: number | null;
  // Notas gerais da medição (texto livre).
  notas: string | null;
  // Snapshot do layout do orçamento (congelado ao gerar).
  orcamento_layout: OrcamentoLayout | null;
  // Sync GHL — ver supabase-migration-etapa10-ghl-sync.sql
  ghl_opportunity_id: string | null;
  location_id: string | null;
  last_ghl_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

// Dados do formulário de medição (preenchido na aba Orçamento antes de negociar).
export interface MedicaoData {
  sqft_real: number | null;
  piso_atual: string | null;
  subfloor: string | null;
  nivelamento_necessario: boolean | null;
  umidade_ok: boolean | null;
  observacoes: string | null;
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
