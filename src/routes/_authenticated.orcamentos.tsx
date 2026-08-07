import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Printer, Plus, Pencil, Settings, Search } from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalItem,
  type MotorGrupo,
  type ProposalStage,
  type LeadQualificacao,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/integrations/supabase/models";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ListFilter, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrcamentoForm } from "@/components/OrcamentoForm";
import { OrcamentoView } from "@/components/OrcamentoView";
import { LeadDetalhe, type LeadLike } from "@/components/LeadDetalhe";
import { OrcamentoLayoutEditor } from "@/components/OrcamentoLayoutEditor";
import { DateRangePicker, presetRange } from "@/components/DateRangePicker";
import { useAuth } from "@/hooks/use-auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type DialogState = { mode: "create" } | { mode: "edit"; proposalId: string } | null;

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos · Ruche" }] }),
  component: OrcamentosPage,
});

type ProposalRow = Proposal & {
  leads: {
    nome_cliente: string;
    endereco: string | null;
    telefone: string | null;
    email: string | null;
    qualificacao: LeadQualificacao | null;
  } | null;
};

// Cor do badge por estágio do kanban (sincronizado).
const STAGE_BADGE: Record<ProposalStage, { bg: string; fg: string }> = {
  appointment_confirmed: { bg: "#FBE7BF", fg: "#7A4E05" },
  appointment_canceled: { bg: "#F6D6C7", fg: "#7A2E12" },
  negotiation: { bg: "#E6F1FB", fg: "#0C447C" },
  no_deal: { bg: "#DEDCD2", fg: "#45443D" },
  deal: { bg: "#D3E8BC", fg: "#2C5212" },
};

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

type Range = { from: Date; to: Date };
const inRange = (iso: string | null, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
};

function OrcamentosPage() {
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProposalRow | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [leadDetail, setLeadDetail] = useState<LeadLike>(null);
  // Proposta que deve avançar p/ Negociação assim que o orçamento for salvo (gate).
  const [advanceNegId, setAdvanceNegId] = useState<string | null>(null);
  // Filtro de período por data de criação do orçamento.
  const [range, setRange] = useState<Range>(() => presetRange("90d"));
  // Busca por nome do cliente + documento do orçamento (layout do parceiro).
  const [busca, setBusca] = useState("");
  // Filtro de status (stage) — múltiplo; vazio = todos.
  const [statusFiltro, setStatusFiltro] = useState<Set<ProposalStage>>(new Set());
  const toggleStatus = (s: ProposalStage) =>
    setStatusFiltro((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const [viewId, setViewId] = useState<string | null>(null);
  // Configuração do layout do orçamento (por parceiro).
  const { user, isRuche } = useAuth();
  const [configOpen, setConfigOpen] = useState(false);
  const [configPid, setConfigPid] = useState<string | null>(null);
  const [partners, setPartners] = useState<{ id: string; nome: string }[]>([]);

  const abrirConfig = async () => {
    if (isRuche) {
      const { data } = await supabase.from("users").select("id, nome, email").order("nome");
      const ps = ((data as { id: string; nome: string; email: string }[]) ?? []).map((u) => ({
        id: u.id,
        nome: u.nome || u.email,
      }));
      setPartners(ps);
      setConfigPid(user?.id ?? ps[0]?.id ?? null);
    } else {
      setConfigPid(user?.id ?? null);
    }
    setConfigOpen(true);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente, endereco, telefone, email, qualificacao)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as ProposalRow[]) ?? []);

    // Nomes dos autores (RLS: parceiro vê só o próprio; ruche vê todos)
    const { data: us } = await supabase.from("users").select("id, nome, email");
    if (us) {
      const map: Record<string, string> = {};
      for (const u of us as { id: string; nome: string; email: string }[]) {
        map[u.id] = u.nome || u.email;
      }
      setAuthors(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const reloadItems = async (proposalId: string) => {
    setItemsLoading(true);
    const { data, error } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("grupo");
    if (error) toast.error(error.message);
    else setItems((data as ProposalItem[]) ?? []);
    setItemsLoading(false);
  };

  // Abre o documento do orçamento com o layout do parceiro (mesma visão do Overview).
  const openDetail = (row: ProposalRow) => setViewId(row.id);

  // Sincroniza o status com o kanban (mesmo campo `stage`), com o mesmo gate.
  const changeStage = async (row: ProposalRow, next: ProposalStage) => {
    if (row.stage === next) return;
    // Gate: só entra em Negociação com o orçamento (medição) preenchido.
    if (next === "negotiation" && !(row.total_cliente && row.total_cliente > 0)) {
      toast.info("Preencha o orçamento (medição) para mover para Negociação.");
      setAdvanceNegId(row.id);
      setDialog({ mode: "edit", proposalId: row.id });
      return;
    }
    const { error } = await supabase.from("proposals").update({ stage: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    load();
  };

  const onSaved = async (proposalId: string) => {
    setDialog(null);
    await load();

    // Após salvar o orçamento, avança p/ Negociação se estava pendente no gate.
    if (advanceNegId === proposalId) {
      setAdvanceNegId(null);
      const { data: fresh } = await supabase
        .from("proposals")
        .select("total_cliente")
        .eq("id", proposalId)
        .maybeSingle();
      const total = (fresh as { total_cliente: number | null } | null)?.total_cliente ?? 0;
      if (total > 0) {
        await supabase.from("proposals").update({ stage: "negotiation" }).eq("id", proposalId);
        toast.success("Orçamento salvo · movido para Negociação");
        await load();
      }
    }

    if (selected && selected.id === proposalId) {
      const { data } = await supabase
        .from("proposals")
        .select("*, leads(nome_cliente, endereco, telefone, email, qualificacao)")
        .eq("id", proposalId)
        .maybeSingle();
      if (data) setSelected(data as ProposalRow);
      await reloadItems(proposalId);
    }
  };

  const formDialog = (
    <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
      <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>
            {dialog?.mode === "edit" ? "Editar orçamento" : "Novo orçamento"}
          </DialogTitle>
        </DialogHeader>
        {dialog && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <OrcamentoForm
              mode={dialog.mode}
              proposalId={dialog.mode === "edit" ? dialog.proposalId : undefined}
              onSaved={() =>
                onSaved(dialog.mode === "edit" ? dialog.proposalId : (selected?.id ?? ""))
              }
              onCancel={() => setDialog(null)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  if (configOpen && configPid) {
    return (
      <div className="space-y-4">
        {isRuche && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Parceiro:</span>
            <Select value={configPid} onValueChange={setConfigPid}>
              <SelectTrigger className="h-9 w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <OrcamentoLayoutEditor
          key={configPid}
          partnerId={configPid}
          onBack={() => setConfigOpen(false)}
        />
      </div>
    );
  }

  if (selected) {
    return (
      <>
        {formDialog}
        <OrcamentoDetail
          row={selected}
          items={items}
          loading={itemsLoading}
          onEdit={() => setDialog({ mode: "edit", proposalId: selected.id })}
          onBack={() => {
            setSelected(null);
            setItems([]);
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {formDialog}
      <LeadDetalhe
        lead={leadDetail}
        open={!!leadDetail}
        onOpenChange={(o) => !o && setLeadDetail(null)}
      />
      <OrcamentoView
        open={!!viewId}
        proposalId={viewId}
        onOpenChange={(o) => !o && setViewId(null)}
        onEdit={() => {
          const id = viewId;
          setViewId(null);
          if (id) setDialog({ mode: "edit", proposalId: id });
        }}
      />
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Orçamentos</h1>
        <p className="text-sm text-muted-foreground">
          Propostas geradas. Abra para ver o orçamento do cliente e exportar.
        </p>
      </div>

      {/* Barra de filtros fixa no scroll — compacta */}
      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b bg-background px-4 py-2.5 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialog({ mode: "create" })} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Novo Orçamento
          </Button>
          <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
          <Button
            variant="outline"
            size="icon"
            onClick={abrirConfig}
            className="shrink-0"
            aria-label="Configuração"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="shrink-0 gap-1.5">
                <ListFilter className="h-4 w-4" />
                Status
                {statusFiltro.size > 0 && (
                  <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                    {statusFiltro.size}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="space-y-0.5">
                {STAGE_ORDER.map((s) => {
                  const on = statusFiltro.has(s);
                  const c = STAGE_BADGE[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStatus(s)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded"
                        style={{
                          background: on ? c.bg : "transparent",
                          border: `1px solid ${on ? c.fg : "var(--border)"}`,
                        }}
                      >
                        {on && <Check className="h-3 w-3" style={{ color: c.fg }} />}
                      </span>
                      {STAGE_LABEL[s]}
                    </button>
                  );
                })}
              </div>
              {statusFiltro.size > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFiltro(new Set())}
                  className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
                >
                  Limpar filtros
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Propostas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-card">Cliente</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Última edição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor da proposta</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows
                    .filter((row) => inRange(row.created_at, range))
                    .filter((row) =>
                      (row.leads?.nome_cliente ?? "").toLowerCase().includes(busca.toLowerCase()),
                    )
                    .filter((row) => statusFiltro.size === 0 || statusFiltro.has(row.stage))
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="sticky left-0 z-10 bg-card">
                          <button
                            type="button"
                            onClick={() => setLeadDetail(row.leads)}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                            title="Abrir card do setter"
                          >
                            {row.leads?.nome_cliente || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {authors[row.partner_id] || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {shortDate(row.created_at)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {shortDate(row.updated_at)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.stage}
                            onValueChange={(v) => changeStage(row, v as ProposalStage)}
                          >
                            <SelectTrigger className="h-8 w-[190px] border-none px-2 shadow-none">
                              <span
                                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                                style={{
                                  background: STAGE_BADGE[row.stage].bg,
                                  color: STAGE_BADGE[row.stage].fg,
                                }}
                              >
                                {STAGE_LABEL[row.stage]}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {STAGE_ORDER.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STAGE_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">{money(row.total_cliente)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                            <FileText className="mr-1 h-4 w-4" /> Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  {rows
                    .filter((row) => inRange(row.created_at, range))
                    .filter((row) =>
                      (row.leads?.nome_cliente ?? "").toLowerCase().includes(busca.toLowerCase()),
                    ).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Nenhum orçamento encontrado.
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

function OrcamentoDetail({
  row,
  items,
  loading,
  onBack,
  onEdit,
}: {
  row: ProposalRow;
  items: ProposalItem[];
  loading: boolean;
  onBack: () => void;
  onEdit: () => void;
}) {
  const cliente = row.leads?.nome_cliente || "Cliente";

  const printPdf = () => {
    const linhas = GRUPO_ORDER.map((grupo) => {
      const grpItems = items.filter((i) => i.grupo === grupo);
      if (!grpItems.length) return "";
      const rowsHtml = grpItems
        .map(
          (i) => `<tr>
            <td>${i.componente}</td>
            <td style="text-align:right">${i.quantidade} ${i.unidade}</td>
            <td style="text-align:right">${money(i.preco_cliente_unit)}</td>
            <td style="text-align:right">${money(i.subtotal_cliente)}</td>
          </tr>`,
        )
        .join("");
      return `<tr><th colspan="4" style="text-align:left;background:#f3f3f3;padding:6px">${GRUPO_LABEL[grupo]}</th></tr>${rowsHtml}`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento — ${cliente}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}
        h1{margin:0 0 4px} .muted{color:#666;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        td,th{border-bottom:1px solid #ddd;padding:6px}
        .total{font-size:18px;font-weight:bold;text-align:right;margin-top:16px}
      </style></head><body>
      <h1>Orçamento — ${cliente}</h1>
      <div class="muted">${row.leads?.endereco ?? ""}${row.leads?.endereco ? " · " : ""}${row.leads?.telefone ?? ""}</div>
      <table>
        <thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qtd</th><th style="text-align:right">Unit</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="total">Total: ${money(row.total_cliente)}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Permita pop-ups para exportar o PDF");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cliente}</h1>
            <p className="text-sm text-muted-foreground">{row.leads?.endereco || "Sem endereço"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" onClick={printPdf} disabled={loading || !items.length}>
            <Printer className="mr-1 h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orçamento do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando itens…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem itens precificados. Verifique se o Motor de Preços cobre os tipos usados.
            </p>
          ) : (
            <>
              {GRUPO_ORDER.map((grupo) => {
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
                          <TableHead className="text-right">Unit</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grpItems.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell>{i.componente}</TableCell>
                            <TableCell className="text-right">
                              {i.quantidade} {i.unidade}
                            </TableCell>
                            <TableCell className="text-right">
                              {money(i.preco_cliente_unit)}
                            </TableCell>
                            <TableCell className="text-right">
                              {money(i.subtotal_cliente)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
              <div className="mt-4 flex justify-end border-t pt-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Valor da proposta</p>
                  <p className="text-3xl font-bold">{money(row.total_cliente)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
