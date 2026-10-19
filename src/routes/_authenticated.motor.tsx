import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  supabase,
  type MotorPrice,
  type MotorGrupo,
  type Empresa,
} from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

export const Route = createFileRoute("/_authenticated/motor")({
  head: () => ({ meta: [{ title: "Pricing · Ruche" }] }),
  component: MotorPage,
});

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Installation",
  demolicao: "Removal",
  prep: "Prep",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

interface NewSub {
  componente: string;
  codigo: string;
  unidade: string;
  preco_cliente: number;
  repasse_partida: number;
  teto_repasse: number;
}

const emptySub = (unidade: string): NewSub => ({
  componente: "",
  codigo: "",
  unidade,
  preco_cliente: 0,
  repasse_partida: 0,
  teto_repasse: 0,
});

// Automatic slug for the codigo from the name (used as the key in the calculation).
// It doesn't need to be pretty — just deterministic and stable.
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sub";

// A tabela de preco deixou de ser uma so (etapa 23). O alvo da tela e uma
// empresa, ou o catalogo modelo de um nicho — que e o que uma empresa nova
// recebe clonado ao ser criada.
const MODELO = "modelo:";

function MotorPage() {
  const { isRuche } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [nichosModelo, setNichosModelo] = useState<string[]>([]);
  const [alvo, setAlvo] = useState<string>("");
  const [prices, setPrices] = useState<MotorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingGrupo, setAddingGrupo] = useState<MotorGrupo | null>(null);
  const [draft, setDraft] = useState<NewSub>(emptySub("sqft"));

  // Empresas e nichos que tem catalogo modelo, para montar o seletor.
  const loadAlvos = async () => {
    const [{ data: es }, { data: mods }] = await Promise.all([
      supabase.from("empresas").select("*").eq("ativo", true).order("nome"),
      supabase.from("motor_prices").select("nicho").is("empresa_id", null),
    ]);
    const lista = (es as Empresa[]) ?? [];
    const nichos = [
      ...new Set(((mods as { nicho: string | null }[]) ?? []).map((m) => m.nicho).filter(Boolean)),
    ] as string[];
    setEmpresas(lista);
    setNichosModelo(nichos.sort());
    setAlvo((a) => a || lista[0]?.id || (nichos[0] ? MODELO + nichos[0] : ""));
  };

  const load = async (alvoAtual: string) => {
    if (!alvoAtual) {
      setPrices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase.from("motor_prices").select("*");
    q = alvoAtual.startsWith(MODELO)
      ? q.is("empresa_id", null).eq("nicho", alvoAtual.slice(MODELO.length))
      : q.eq("empresa_id", alvoAtual);
    const { data, error } = await q.order("grupo").order("componente");
    if (error) toast.error(error.message);
    else setPrices((data as MotorPrice[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) loadAlvos();
  }, [isRuche]);

  useEffect(() => {
    if (isRuche) load(alvo);
  }, [alvo, isRuche]);

  const editandoModelo = alvo.startsWith(MODELO);
  const nichoAlvo = editandoModelo
    ? alvo.slice(MODELO.length)
    : (empresas.find((e) => e.id === alvo)?.nicho ?? null);
  const empresaAlvo = editandoModelo ? null : alvo || null;

  if (!isRuche) return <Navigate to="/overview" />;

  const patchLocal = (id: string, patch: Partial<MotorPrice>) =>
    setPrices((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const saveRow = async (row: MotorPrice) => {
    if (row.repasse_partida > row.teto_repasse) {
      toast.error("Payout start cannot be greater than the cap");
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from("motor_prices")
      .update({
        preco_cliente: row.preco_cliente,
        repasse_partida: row.repasse_partida,
        teto_repasse: row.teto_repasse,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success(`${row.componente} updated`);
  };

  const toggleAtivo = async (row: MotorPrice, ativo: boolean) => {
    patchLocal(row.id, { ativo });
    const { error } = await supabase.from("motor_prices").update({ ativo }).eq("id", row.id);
    if (error) {
      patchLocal(row.id, { ativo: !ativo });
      toast.error(error.message);
    }
  };

  const startAdd = (grupo: MotorGrupo) => {
    setAddingGrupo(grupo);
    setDraft(emptySub(grupo === "extra" ? "unidade" : "sqft"));
  };

  const addSub = async (grupo: MotorGrupo) => {
    if (!draft.componente.trim()) return toast.error("Enter the subcategory name");
    if (draft.repasse_partida > draft.teto_repasse)
      return toast.error("Payout start cannot be greater than the cap");
    const codigo = (draft.codigo.trim() || slugify(draft.componente)).slice(0, 60);
    const { error } = await supabase.from("motor_prices").insert({
      empresa_id: empresaAlvo,
      nicho: nichoAlvo,
      grupo,
      codigo,
      componente: draft.componente.trim(),
      unidade: draft.unidade.trim() || "un",
      preco_cliente: draft.preco_cliente,
      repasse_partida: draft.repasse_partida,
      teto_repasse: draft.teto_repasse,
    });
    if (error) {
      if (error.code === "23505")
        return toast.error(`Subcategory "${codigo}" already exists in this group`);
      return toast.error(error.message);
    }
    toast.success("Subcategory added");
    setAddingGrupo(null);
    load(alvo);
  };

  const deleteRow = async (row: MotorPrice) => {
    if (!confirm(`Remove the subcategory "${row.componente}"?`)) return;
    const { error } = await supabase.from("motor_prices").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Subcategory removed");
    load(alvo);
  };

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Pricing" />
        <p className="text-sm text-muted-foreground">
          Price charged to the client and the partner payout band (start → cap), per unit.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Catalog:</span>
        <Select value={alvo} onValueChange={setAlvo}>
          <SelectTrigger className="h-9 w-72">
            <SelectValue placeholder="Select a catalog" />
          </SelectTrigger>
          <SelectContent>
            {empresas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome} · {e.nicho}
              </SelectItem>
            ))}
            {nichosModelo.map((n) => (
              <SelectItem key={n} value={MODELO + n}>
                Template · {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editandoModelo && (
          <span className="rounded-full bg-[#FBE7BF] px-2.5 py-1 text-xs font-medium text-[#7A4E05]">
            Template — what a new company starts from. Editing here changes no existing quote.
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        GRUPO_ORDER.map((grupo) => {
          const rows = prices.filter((p) => p.grupo === grupo);
          const canEditRows = grupo !== "extra";
          return (
            <Card key={grupo}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>{GRUPO_LABEL[grupo]}</CardTitle>
                  <CardDescription>
                    {grupo === "extra" ? "Values per unit of the extra" : "Values per sqft"}
                  </CardDescription>
                </div>
                {canEditRows && (
                  <Button type="button" variant="outline" size="sm" onClick={() => startAdd(grupo)}>
                    <Plus className="mr-1 h-4 w-4" /> Subcategory
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 z-20 bg-card">Component</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="w-32">Client price</TableHead>
                        <TableHead className="w-32">Payout start</TableHead>
                        <TableHead className="w-32">Payout cap</TableHead>
                        <TableHead className="w-20">Active</TableHead>
                        <TableHead className="w-36 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="sticky left-0 z-10 bg-card font-medium">
                            {row.componente}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{row.unidade}</TableCell>
                          <TableCell>
                            <NumCell
                              value={row.preco_cliente}
                              onChange={(v) => patchLocal(row.id, { preco_cliente: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumCell
                              value={row.repasse_partida}
                              onChange={(v) => patchLocal(row.id, { repasse_partida: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <NumCell
                              value={row.teto_repasse}
                              onChange={(v) => patchLocal(row.id, { teto_repasse: v })}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={row.ativo}
                              onCheckedChange={(v) => toggleAtivo(row, v)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                disabled={savingId === row.id}
                                onClick={() => saveRow(row)}
                              >
                                {savingId === row.id ? "Saving…" : "Save"}
                              </Button>
                              {canEditRows && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                                  onClick={() => deleteRow(row)}
                                  title="Remove"
                                  aria-label="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {addingGrupo === grupo && (
                        <TableRow>
                          <TableCell>
                            <Input
                              placeholder="Name (e.g. Bamboo)"
                              value={draft.componente}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, componente: e.target.value }))
                              }
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={draft.unidade}
                              onChange={(e) => setDraft((d) => ({ ...d, unidade: e.target.value }))}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <NumCell
                              value={draft.preco_cliente}
                              onChange={(v) => setDraft((d) => ({ ...d, preco_cliente: v }))}
                            />
                          </TableCell>
                          <TableCell>
                            <NumCell
                              value={draft.repasse_partida}
                              onChange={(v) => setDraft((d) => ({ ...d, repasse_partida: v }))}
                            />
                          </TableCell>
                          <TableCell>
                            <NumCell
                              value={draft.teto_repasse}
                              onChange={(v) => setDraft((d) => ({ ...d, teto_repasse: v }))}
                            />
                          </TableCell>
                          <TableCell />
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" onClick={() => addSub(grupo)}>
                                Add
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAddingGrupo(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      min={0}
      step="0.01"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8"
    />
  );
}
