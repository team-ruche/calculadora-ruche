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
