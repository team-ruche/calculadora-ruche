import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Loader2, Copy, Trash2 } from "lucide-react";
import {
  supabase,
  callGhlSyncPartner,
  type AppUser,
  type AppRole,
} from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const { isRuche, user: current } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);

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

    // Aprovando um parceiro -> cria a opção dele no dropdown "Assigned
    // Partner" do GHL + a linha em ghl_partner_map, pra visita marcada pelo
    // call center já cair no kanban certo. Best-effort: não trava a aprovação.
    const target = users.find((u) => u.id === id);
    const role = patch.role ?? target?.role;
    if (patch.status === "aprovado" && role === "parceiro") {
      callGhlSyncPartner(id).catch(() =>
        toast.error(
          "Parceiro aprovado, mas falhou ao criar no dropdown do GHL — avise pra checar manualmente.",
        ),
      );
    }

    toast.success("Usuário atualizado");
    load();
  };

  const excluirUser = async (u: AppUser) => {
    if (u.id === current?.id) return toast.error("Você não pode excluir a si mesmo.");
    if (!confirm(`Excluir ${u.nome || u.email}? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: u.id },
    });
    if (error) return toast.error(error.message);
    toast.success("Usuário excluído");
    load();
  };

  return (
    <div className="space-y-6">
      <NovoUsuarioDialog open={novoOpen} onOpenChange={setNovoOpen} onCreated={load} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Crie parceiros, aprove cadastros e defina o papel.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Novo usuário
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Todos os usuários</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[680px]">
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
                  {users.map((u) => {
                    const isSelf = u.id === current?.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.nome || "—"}
                          {isSelf && (
                            <span className="ml-1 text-xs text-muted-foreground">(você)</span>
                          )}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.telefone || "—"}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(v) => updateUser(u.id, { role: v as AppRole })}
                            disabled={isSelf}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="parceiro">parceiro</SelectItem>
                              <SelectItem value="ruche">ruche</SelectItem>
                            </SelectContent>
                          </Select>
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
                            <Button
                              size="sm"
                              onClick={() => updateUser(u.id, { status: "aprovado" })}
                            >
                              Aprovar
                            </Button>
                          )}
                          {u.status !== "reprovado" && !isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUser(u.id, { status: "reprovado" })}
                            >
                              Reprovar
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => excluirUser(u)}
                              className="border-destructive/40 text-destructive hover:bg-destructive/5"
                              aria-label="Excluir usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum usuário ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Criar usuário (parceiro) ----------------------------------------------
type NovoForm = {
  nome: string;
  email: string;
  telefone: string;
  nicho: string;
  endereco_empresa: string;
  ein: string;
  role: AppRole;
  mode: "invite" | "password";
};

const emptyForm: NovoForm = {
  nome: "",
  email: "",
  telefone: "",
  nicho: "",
  endereco_empresa: "",
  ein: "",
  role: "parceiro",
  mode: "invite",
};

type Resultado = { mode: "invite" | "password"; email: string; senha?: string | null };

function NovoUsuarioDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NovoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const set = <K extends keyof NovoForm>(key: K, value: NovoForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const reset = () => {
    setForm(emptyForm);
    setResultado(null);
  };

  const submit = async () => {
    if (!form.nome.trim() || !form.email.trim() || !form.telefone.trim()) {
      toast.error("Nome, e-mail e telefone são obrigatórios.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { ...form, redirectTo: `${window.location.origin}/overview` },
    });
    setSaving(false);
    if (error) {
      // A mensagem de erro (403/400 etc.) vem no corpo da resposta.
      let msg = error.message ?? "Falha ao criar usuário";
      try {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json() : null;
        if (body?.error) msg = body.error;
      } catch {
        /* mantém msg padrão */
      }
      return toast.error(msg);
    }
    const res = data as {
      ok?: boolean;
      senha_temporaria?: string;
      mode?: "invite" | "password";
      error?: string;
    };
    if (res?.error) return toast.error(res.error);
    toast.success(res?.mode === "invite" ? "Convite enviado" : "Usuário criado");
    setResultado({
      mode: res?.mode ?? form.mode,
      email: form.email,
      senha: res?.senha_temporaria ?? null,
    });
    onCreated();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Cria o login do parceiro já aprovado. Nome, e-mail e telefone são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4 py-2">
            {resultado.mode === "invite" ? (
              <p className="text-sm text-muted-foreground">
                Convite enviado para <strong>{resultado.email}</strong>. O parceiro vai receber um
                e-mail com um link para definir a própria senha e acessar a plataforma.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Usuário criado. Compartilhe a senha temporária com o parceiro — ele entra com o
                  e-mail e essa senha, e será obrigado a trocá-la no primeiro acesso.
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                  <code className="flex-1 text-sm font-semibold">{resultado.senha}</code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      navigator.clipboard.writeText(resultado.senha ?? "");
                      toast.success("Senha copiada");
                    }}
                    title="Copiar"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Criar outro
              </Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nome *" value={form.nome} onChange={(v) => set("nome", v)} />
              <Campo
                label="E-mail *"
                type="email"
                value={form.email}
                onChange={(v) => set("email", v)}
              />
              <Campo
                label="Telefone *"
                value={form.telefone}
                onChange={(v) => set("telefone", v)}
              />
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parceiro">Parceiro</SelectItem>
                    <SelectItem value="ruche">Ruche (admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.role === "parceiro" && (
              <div className="rounded-lg border p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dados do parceiro <span className="font-normal normal-case">(opcional)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    label="Nicho de atuação"
                    value={form.nicho}
                    onChange={(v) => set("nicho", v)}
                  />
                  <Campo label="EIN number" value={form.ein} onChange={(v) => set("ein", v)} />
                  <div className="sm:col-span-2">
                    <Campo
                      label="Endereço da empresa"
                      value={form.endereco_empresa}
                      onChange={(v) => set("endereco_empresa", v)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Como o usuário vai acessar?</Label>
              <Select value={form.mode} onValueChange={(v) => set("mode", v as NovoForm["mode"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Enviar convite por e-mail (define a senha)</SelectItem>
                  <SelectItem value="password">Gerar senha temporária</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.mode === "invite"
                  ? "O parceiro recebe um link por e-mail para criar a própria senha."
                  : "Você recebe uma senha temporária para repassar; a troca é obrigatória no 1º acesso."}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.mode === "invite" ? "Criar e enviar convite" : "Criar usuário"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
