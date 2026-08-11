import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Set-new-password screen. Used in 3 cases: first access (temporary password),
// email invite, and recovery ("forgot my password").
export function DefinirSenha({ title }: { title?: string }) {
  const { session, refreshProfile, clearRecovery, signOut } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.error("The password must be at least 6 characters.");
    if (senha !== confirma) return toast.error("The passwords don't match.");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    // Clears the mandatory-change flag (if there is a user session).
    if (session?.user) {
      await supabase
        .from("users")
        .update({ must_change_password: false })
        .eq("id", session.user.id);
    }
    clearRecovery();
    await refreshProfile();
    setSaving(false);
    toast.success("Password set");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title ?? "Set your password"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For your security, choose a new password to access the platform.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="nova">New password</Label>
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
              <Label htmlFor="conf">Confirm password</Label>
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
              Save password
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => signOut()}
              disabled={saving}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
