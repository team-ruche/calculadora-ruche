import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Tela de definir nova senha. Usada em 3 casos: 1º acesso (senha temporária),
// convite por e-mail e recuperação ("esqueci minha senha").
export function DefinirSenha({ title }: { title?: string }) {
  const { session, refreshProfile, clearRecovery, signOut } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.error("A senha precisa ter ao menos 6 caracteres.");
    if (senha !== confirma) return toast.error("As senhas não conferem.");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    // Limpa o flag de troca obrigatória (se houver sessão de usuário).
    if (session?.user) {
      await supabase
        .from("users")
        .update({ must_change_password: false })
        .eq("id", session.user.id);
    }
    clearRecovery();
    await refreshProfile();
    setSaving(false);
    toast.success("Senha definida");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title ?? "Defina sua senha"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Para sua segurança, escolha uma nova senha para acessar a plataforma.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="nova">Nova senha</Label>
              <Input
                id="nova"
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf">Confirmar senha</Label>
              <Input
                id="conf"
                type="password"
                required
                minLength={6}
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar senha
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => signOut()}
              disabled={saving}
            >
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
