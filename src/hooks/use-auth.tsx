import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type AppUser } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

interface AuthContextValue {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  isRuche: boolean;
  isAprovado: boolean;
  // true quando o usuário chegou por link de recuperação de senha.
  passwordRecovery: boolean;
  clearRecovery: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from("users").select("*").eq("id", uid).maybeSingle();
    setUser((data as AppUser) ?? null);
  };

  useEffect(() => {
    // Listener primeiro
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(s);
      if (s?.user) {
        // defer para evitar deadlock
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setUser(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthContextValue = {
    session,
    user,
    loading,
    isRuche: user?.role === "ruche",
    isAprovado: user?.status === "aprovado",
    passwordRecovery,
    clearRecovery: () => setPasswordRecovery(false),
    refreshProfile: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setPasswordRecovery(false);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
