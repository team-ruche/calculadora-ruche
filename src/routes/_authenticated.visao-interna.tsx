import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalItem,
  type MotorGrupo,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/visao-interna")({
  head: () => ({ meta: [{ title: "Visão Interna · Ruche" }] }),
  component: VisaoInternaPage,
});

type ProposalRow = Proposal & { leads: { nome_cliente: string } | null };

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Demolição",
  prep: "Preparação",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

function VisaoInternaPage() {
  const { isRuche } = useAuth();
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProposalRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as ProposalRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  if (!isRuche) return <Navigate to="/overview" />;

  if (selected) {
    return (
      <VisaoDetail
        row={selected}
        onBack={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visão Interna</h1>
        <p className="text-sm text-muted-foreground">
          Repasse ao parceiro (ajustável até o teto) e margem Ruche por proposta.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Propostas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total cliente</TableHead>
                  <TableHead className="text-right">Total repasse</TableHead>
                  <TableHead className="text-right">Margem Ruche</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.leads?.nome_cliente || "—"}</TableCell>
                    <TableCell className="text-right">{money(row.total_cliente)}</TableCell>
                    <TableCell className="text-right">{money(row.total_repasse)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {money(row.margem_ruche)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                        <Eye className="mr-1 h-4 w-4" /> Abrir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhuma proposta ainda.
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

function VisaoDetail({ row, onBack }: { row: ProposalRow; onBack: () => void }) {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [totals, setTotals] = useState({
    cliente: row.total_cliente,
    repasse: row.total_repasse,
    margem: row.margem_ruche,
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", row.id)
      .order("grupo");
    if (error) toast.error(error.message);
    else setItems((data as ProposalItem[]) ?? []);
    const { data: p } = await supabase
      .from("proposals")
      .select("total_cliente, total_repasse, margem_ruche")
      .eq("id", row.id)
      .maybeSingle();
    if (p)
      setTotals({ cliente: p.total_cliente, repasse: p.total_repasse, margem: p.margem_ruche });
    setLoading(false);
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const patchLocal = (id: string, repasse: number) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, repasse_unit: repasse } : i)));

  const saveRepasse = async (item: ProposalItem) => {
    setSavingId(item.id);
    const { error } = await supabase.rpc("rpc_ajustar_repasse", {
      p_item_id: item.id,
      p_repasse_unit: item.repasse_unit,
    });
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Repasse ajustado");
    loadItems();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{row.leads?.nome_cliente || "—"}</h1>
          <p className="text-sm text-muted-foreground">Visão interna — repasse e margem</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total cliente" value={money(totals.cliente)} />
        <SummaryCard label="Total repasse" value={money(totals.repasse)} />
        <SummaryCard label="Margem Ruche" value={money(totals.margem)} highlight />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem itens precificados.</p>
          ) : (
            GRUPO_ORDER.map((grupo) => {
              const grpItems = items.filter((i) => i.grupo === grupo);
              if (!grpItems.length) return null;
              return (
                <div key={grupo} className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    {GRUPO_LABEL[grupo]}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Subtotal cliente</TableHead>
                        <TableHead className="w-40 text-right">Repasse/un (teto)</TableHead>
                        <TableHead className="text-right">Subtotal repasse</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grpItems.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.componente}</TableCell>
                          <TableCell className="text-right">
                            {i.quantidade} {i.unidade}
                          </TableCell>
                          <TableCell className="text-right">{money(i.subtotal_cliente)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={i.repasse_teto}
                                step="0.01"
                                value={i.repasse_unit}
                                onChange={(e) => patchLocal(i.id, Number(e.target.value))}
                                className="h-8 w-24 text-right"
                              />
                              <span className="text-xs text-muted-foreground">
                                / {money(i.repasse_teto)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {money(i.repasse_unit * i.quantidade)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={savingId === i.id}
                              onClick={() => saveRepasse(i)}
                            >
                              {savingId === i.id ? "…" : "Salvar"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "bg-primary text-primary-foreground" : ""}>
      <CardContent className="p-6">
        <p
          className={`text-xs uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
        >
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
