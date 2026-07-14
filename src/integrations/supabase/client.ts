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

export type AppRole = "ruche" | "parceiro";
export type UserStatus = "pendente" | "aprovado" | "reprovado";

export interface AppUser {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  role: AppRole;
  status: UserStatus;
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
  created_at: string;
}

export interface Proposal {
  id: string;
  lead_id: string;
  partner_id: string;
  status: string;
  total_cliente: number | null;
  total_repasse: number | null;
  margem_ruche: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalRoom {
  id: string;
  proposal_id: string;
  nome: string;
  area_sqft: number;
  piso_novo: PisoTipo;
  piso_atual: PisoTipo;
  preparo: PreparoNivel;
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
