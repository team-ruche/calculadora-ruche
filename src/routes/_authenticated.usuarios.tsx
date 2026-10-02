import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Loader2, Copy, Trash2 } from "lucide-react";
import {
  supabase,
  callGhlSyncPartner,
  USER_STATUS_LABEL,
  ROLE_LABEL,
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
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Users · Ruche" }] }),
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

    // Approving a partner -> creates their option in the GHL "Assigned
    // Partner" dropdown + the row in ghl_partner_map, so an appointment booked
    // by the call center lands in the right kanban. Best-effort: does not block approval.
    const target = users.find((u) => u.id === id);
    const role = patch.role ?? target?.role;
    if (patch.status === "aprovado" && role === "parceiro") {
      callGhlSyncPartner(id).catch(() =>
        toast.error(
          "Partner approved, but failed to create them in the GHL dropdown — please check manually.",
        ),
      );
    }

    toast.success("User updated");
    load();
  };

  const excluirUser = async (u: AppUser) => {
    if (u.id === current?.id) return toast.error("You cannot delete yourself.");
    if (!confirm(`Delete ${u.nome || u.email}? This action cannot be undone.`)) return;
    const { error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: u.id },
    });
    if (error) return toast.error(error.message);
    toast.success("User deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <NovoUsuarioDialog open={novoOpen} onOpenChange={setNovoOpen} onCreated={load} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageHeader title="Users" />
          <p className="text-sm text-muted-foreground">
            Create partners, approve sign-ups and set the role.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New user
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[680px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                            <span className="ml-1 text-xs text-muted-foreground">(you)</span>
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
                              <SelectItem value="parceiro">{ROLE_LABEL.parceiro}</SelectItem>
                              <SelectItem value="ruche">{ROLE_LABEL.ruche}</SelectItem>
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
                            {USER_STATUS_LABEL[u.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-2 text-right">
                          {u.status !== "aprovado" && (
                            <Button
                              size="sm"
                              onClick={() => updateUser(u.id, { status: "aprovado" })}
                            >
                              Approve
                            </Button>
                          )}
                          {u.status !== "reprovado" && !isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUser(u.id, { status: "reprovado" })}
                            >
                              Reject
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => excluirUser(u)}
                              className="border-destructive/40 text-destructive hover:bg-destructive/5"
                              aria-label="Delete user"
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
                        No users yet.
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

// ---- Create user (partner) ----------------------------------------------
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
      toast.error("Name, email and phone are required.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { ...form, redirectTo: `${window.location.origin}/overview` },
    });
    setSaving(false);
    if (error) {
      // The error message (403/400 etc.) comes in the response body.
      let msg = error.message ?? "Failed to create user";
      try {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json() : null;
        if (body?.error) msg = body.error;
      } catch {
        /* keep default msg */
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
    toast.success(res?.mode === "invite" ? "Invite sent" : "User created");
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
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Creates the partner's login, already approved. Name, email and phone are required.
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4 py-2">
            {resultado.mode === "invite" ? (
              <p className="text-sm text-muted-foreground">
                Invite sent to <strong>{resultado.email}</strong>. The partner will receive an email
                with a link to set their own password and access the platform.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  User created. Share the temporary password with the partner — they log in with
                  their email and this password, and will be required to change it on first access.
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                  <code className="flex-1 text-sm font-semibold">{resultado.senha}</code>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={() => {
                      navigator.clipboard.writeText(resultado.senha ?? "");
                      toast.success("Password copied");
                    }}
                    title="Copy"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Create another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Name *" value={form.nome} onChange={(v) => set("nome", v)} />
              <Campo
                label="Email *"
                type="email"
                value={form.email}
                onChange={(v) => set("email", v)}
              />
              <Campo label="Phone *" value={form.telefone} onChange={(v) => set("telefone", v)} />
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parceiro">Partner</SelectItem>
                    <SelectItem value="ruche">Ruche (admin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.role === "parceiro" && (
              <div className="rounded-lg border p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Partner details <span className="font-normal normal-case">(optional)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="Niche" value={form.nicho} onChange={(v) => set("nicho", v)} />
                  <Campo label="EIN number" value={form.ein} onChange={(v) => set("ein", v)} />
                  <div className="sm:col-span-2">
                    <Campo
                      label="Company address"
                      value={form.endereco_empresa}
                      onChange={(v) => set("endereco_empresa", v)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>How will the user access?</Label>
              <Select value={form.mode} onValueChange={(v) => set("mode", v as NovoForm["mode"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invite">Send email invite (sets their password)</SelectItem>
                  <SelectItem value="password">Generate temporary password</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.mode === "invite"
                  ? "The partner receives an email link to create their own password."
                  : "You get a temporary password to pass along; changing it is required on first access."}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.mode === "invite" ? "Create and send invite" : "Create user"}
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
