import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, type AppUser } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários · Ruche" }] }),
  component: UsuariosPage,
});

function UsuariosPage() {
  const { isRuche } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setUsers((data as AppUser[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  if (!isRuche) return <Navigate to="/overview" />;

  const updateUser = async (id: string, patch: Partial<AppUser>) => {
    const { error } = await supabase.from("users").update(patch).eq("id", id);
    if (error) return toast.error(error.message);

    if (patch.role) {
      await supabase.from("user_roles").delete().eq("user_id", id);
      await supabase.from("user_roles").insert({ user_id: id, role: patch.role });
    }

    toast.success("Usuário atualizado");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">Aprove novos cadastros e defina o papel.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todos os usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.telefone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "ruche" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          u.status === "aprovado"
                            ? "default"
                            : u.status === "reprovado"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {u.status !== "aprovado" && (
                        <Button size="sm" onClick={() => updateUser(u.id, { status: "aprovado" })}>
                          Aprovar
                        </Button>
                      )}
                      {u.status !== "reprovado" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateUser(u.id, { status: "reprovado" })}
                        >
                          Reprovar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          updateUser(u.id, { role: u.role === "ruche" ? "parceiro" : "ruche" })
                        }
                      >
                        {u.role === "ruche" ? "→ Parceiro" : "→ Ruche"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum usuário ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
