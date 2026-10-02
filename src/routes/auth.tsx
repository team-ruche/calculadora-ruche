import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Lock, User, Phone, ArrowRight, Hexagon } from "lucide-react";
import { supabase } from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Ruche Digital" }] }),
  component: AuthPage,
});

// Hive pattern (hexagons) — heropatterns, in low-opacity amber.
const HEX_BG =
  "url(\"data:image/svg+xml,%3Csvg width='28' height='49' viewBox='0 0 28 49' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z' fill='%23E9B93E' fill-opacity='0.045' fill-rule='evenodd'/%3E%3C/svg%3E\")";

function Logo({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Hexagon className="h-6 w-6 text-[#E9B93E]" strokeWidth={2.5} />
      <span className="flex items-baseline">
        <span
          className={`text-2xl font-bold tracking-tight ${dark ? "text-white" : "text-foreground"}`}
        >
          ruche
        </span>
        <span className="text-2xl font-bold text-[#E9B93E]">.</span>
      </span>
    </div>
  );
}

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/overview" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome!");
    navigate({ to: "/overview" });
  };

  const handleForgot = async () => {
    if (!email) return toast.error("Enter your email in the field above first.");
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/overview`,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("We sent a reset link to your email.");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/overview`,
        data: { nome, telefone },
      },
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Wait for approval from a Ruche admin.");
    setTab("login");
  };

  return (
    <div className="auth-shell relative flex min-h-screen">
      {/* Hive texture in the background — mobile only */}
      <div
        className="absolute inset-0 lg:hidden"
        style={{ backgroundColor: "#17140c", backgroundImage: HEX_BG }}
      />
      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background: "radial-gradient(60% 40% at 50% 30%, rgba(233,185,62,0.09), transparent 70%)",
        }}
      />

      {/* ===== Brand panel (hive) — desktop only ===== */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 lg:flex">
        <div
          className="absolute inset-0"
          style={{ backgroundColor: "#17140c", backgroundImage: HEX_BG }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 55% 40%, rgba(233,185,62,0.09), transparent 70%)",
          }}
        />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-[#E9B93E]">
            Internal OS
          </p>
          <h2 className="text-4xl font-bold leading-tight text-white">
            The whole operation
            <br />
            in one hive.
          </h2>
        </div>
      </div>

      {/* ===== Form ===== */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="auth-card w-full max-w-md rounded-3xl p-7 sm:p-10">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h1 className="text-3xl font-semibold tracking-[-0.045em] text-foreground">
            {tab === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "login"
              ? "Sign in to access the panel"
              : "Sign up — approval is handled by a Ruche admin"}
          </p>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="mt-7 space-y-3">
              <IconField icon={Mail}>
                <Input
                  type="email"
                  required
                  aria-label="Email"
                  autoComplete="email"
                  placeholder="Email"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </IconField>
              <IconField icon={Lock}>
                <Input
                  type="password"
                  required
                  aria-label="Password"
                  autoComplete="current-password"
                  placeholder="Password"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </IconField>
              <SubmitButton submitting={submitting} label="Sign in" />
            </form>
          ) : (
            <form onSubmit={handleSignup} className="mt-7 space-y-3">
              <IconField icon={User}>
                <Input
                  required
                  aria-label="Full name"
                  placeholder="Full name"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </IconField>
              <IconField icon={Phone}>
                <Input
                  aria-label="Phone"
                  type="tel"
                  placeholder="Phone"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </IconField>
              <IconField icon={Mail}>
                <Input
                  type="email"
                  required
                  aria-label="Email"
                  autoComplete="email"
                  placeholder="Email"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </IconField>
              <IconField icon={Lock}>
                <Input
                  type="password"
                  required
                  minLength={6}
                  aria-label="Password"
                  autoComplete="new-password"
                  placeholder="Password"
                  className="h-12 border-none bg-white pl-10 shadow-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </IconField>
              <SubmitButton submitting={submitting} label="Create account" />
            </form>
          )}

          <div className="mt-5 space-y-2 text-center text-sm">
            {tab === "login" && (
              <button
                type="button"
                onClick={handleForgot}
                disabled={submitting}
                className="block w-full font-medium text-[#9A7B12] hover:underline"
              >
                Forgot my password
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab(tab === "login" ? "signup" : "login")}
              className="block w-full font-medium text-[#9A7B12] hover:underline"
            >
              {tab === "login"
                ? "Don't have an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconField({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {children}
    </div>
  );
}

function SubmitButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#E9B93E] font-semibold text-[#3D2600] shadow-sm transition-colors hover:bg-[#e0ad2a] disabled:opacity-60"
    >
      {submitting ? "Please wait…" : label}
      {!submitting && <ArrowRight className="h-4 w-4" />}
    </button>
  );
}
