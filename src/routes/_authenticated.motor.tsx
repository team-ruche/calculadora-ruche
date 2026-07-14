import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase, type MotorPrice, type MotorGrupo } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/motor")({
  head: () => ({ meta: [{ title: "Precificação · Ruche" }] }),
  component: MotorPage,
});

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
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

// slug automático p/ o codigo a partir do nome (usado como chave no cálculo).
// Não precisa ser bonito — só determinístico e estável.
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sub";

function MotorPage() {
  const { isRuche } = useAuth();
  const [prices, setPrices] = useState<MotorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addingGrupo, setAddingGrupo] = useState<MotorGrupo | null>(null);
  const [draft, setDraft] = useState<NewSub>(emptySub("sqft"));

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("motor_prices")
      .select("*")
      .order("grupo")
      .order("componente");
    if (error) toast.error(error.message);
    else setPrices((data as MotorPrice[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  if (!isRuche) return <Navigate to="/overview" />;

  const patchLocal = (id: string, patch: Partial<MotorPrice>) =>
    setPrices((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const saveRow = async (row: MotorPrice) => {
    if (row.repasse_partida > row.teto_repasse) {
      toast.error("Repasse de partida não pode ser maior que o teto");
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
    toast.success(`${row.componente} atualizado`);
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
    if (!draft.componente.trim()) return toast.error("Informe o nome da subcategoria");
    if (draft.repasse_partida > draft.teto_repasse)
      return toast.error("Repasse de partida não pode ser maior que o teto");
    const codigo = (draft.codigo.trim() || slugify(draft.componente)).slice(0, 60);
    const { error } = await supabase.from("motor_prices").insert({
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
        return toast.error(`Já existe a subcategoria "${codigo}" nesse grupo`);
      return toast.error(error.message);
    }
    toast.success("Subcategoria adicionada");
    setAddingGrupo(null);
    load();
  };

  const deleteRow = async (row: MotorPrice) => {
    if (!confirm(`Remover a subcategoria "${row.componente}"?`)) return;
    const { error } = await supabase.from("motor_prices").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Subcategoria removida");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Precificação</h1>
        <p className="text-sm text-muted-foreground">
          Preço cobrado do cliente e banda de repasse ao parceiro (partida → teto), por unidade.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
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
                    {grupo === "extra" ? "Valores por unidade do extra" : "Valores por sqft"}
                  </CardDescription>
                </div>
                {canEditRows && (
                  <Button type="button" variant="outline" size="sm" onClick={() => startAdd(grupo)}>
                    <Plus className="mr-1 h-4 w-4" /> Subcategoria
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Componente</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="w-32">Preço cliente</TableHead>
                      <TableHead className="w-32">Repasse partida</TableHead>
                      <TableHead className="w-32">Teto repasse</TableHead>
                      <TableHead className="w-20">Ativo</TableHead>
                      <TableHead className="w-28 text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.componente}</TableCell>
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
                        <TableCell className="space-x-1 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingId === row.id}
                            onClick={() => saveRow(row)}
                          >
                            {savingId === row.id ? "…" : "Salvar"}
                          </Button>
                          {canEditRows && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteRow(row)}
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {addingGrupo === grupo && (
                      <TableRow>
                        <TableCell>
                          <Input
                            placeholder="Nome (ex: Bamboo)"
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
                        <TableCell className="space-x-1 text-right">
                          <Button size="sm" onClick={() => addSub(grupo)}>
                            Adicionar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAddingGrupo(null)}>
                            Cancelar
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
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
