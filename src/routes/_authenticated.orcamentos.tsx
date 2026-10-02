import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Printer,
  Plus,
  Pencil,
  Settings,
  Search,
  SlidersHorizontal,
  ChevronDown as ChevronDownIcon,
  ChevronRight,
} from "lucide-react";
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
import { PricingDialog } from "@/components/PricingDialog";
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
import { PageHeader } from "@/components/PageHeader";
import { STAGE_STYLE } from "@/lib/proposal-stage";

type DialogState = { mode: "create" } | { mode: "edit"; proposalId: string } | null;

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({ meta: [{ title: "Quotes · Ruche" }] }),
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

const STAGE_BADGE = STAGE_STYLE;

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Installation",
  demolicao: "Removal",
  prep: "Preparation",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US") : "—");

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
  // Proposal that should advance to Negotiation as soon as the quote is saved (gate).
  const [advanceNegId, setAdvanceNegId] = useState<string | null>(null);
  // Period filter by quote creation date.
  const [range, setRange] = useState<Range>(() => presetRange("90d"));
  // Search by client name + quote document (partner layout).
  const [busca, setBusca] = useState("");
  // Status (stage) filter — multiple; empty = all.
  const [statusFiltro, setStatusFiltro] = useState<Set<ProposalStage>>(new Set());
  const toggleStatus = (s: ProposalStage) =>
    setStatusFiltro((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const [viewId, setViewId] = useState<string | null>(null);
  // Aba de pricing do orcamento. So Ruche abre: a tela mostra repasse e margem.
  const [pricingRow, setPricingRow] = useState<ProposalRow | null>(null);
  // Os orcamentos ficam agrupados por cliente. A chave e o nome normalizado:
  // dois leads do mesmo cliente (um por parceiro, por exemplo) caem no mesmo
  // grupo, que e exatamente o que se quer olhar junto.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const toggleGrupo = (k: string) =>
    setRecolhidos((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  // Quote layout settings (per partner).
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

    // Author names (RLS: partner sees only their own; ruche sees all)
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

  // Opens the quote document with the partner layout (same view as Overview).
  const openDetail = (row: ProposalRow) => setViewId(row.id);

  // Syncs the status with the kanban (same `stage` field), with the same gate.
  const changeStage = async (row: ProposalRow, next: ProposalStage) => {
    if (row.stage === next) return;
    // Gate: pricing approval and negotiation both need the quote priced.
    if (
      (next === "pricing_review" || next === "negotiation") &&
      !(row.total_cliente && row.total_cliente > 0)
    ) {
      toast.info("Fill in the quote (measurement) first.");
      setAdvanceNegId(row.id);
      setDialog({ mode: "edit", proposalId: row.id });
      return;
    }
    const { error } = await supabase.from("proposals").update({ stage: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    load();
  };

  const onSaved = async (proposalId: string) => {
    setDialog(null);
    await load();

    // After saving the quote, advance to Negotiation if it was pending at the gate.
    if (advanceNegId === proposalId) {
      setAdvanceNegId(null);
      const { data: fresh } = await supabase
        .from("proposals")
        .select("total_cliente")
        .eq("id", proposalId)
        .maybeSingle();
      const total = (fresh as { total_cliente: number | null } | null)?.total_cliente ?? 0;
      if (total > 0) {
        await supabase.from("proposals").update({ stage: "pricing_review" }).eq("id", proposalId);
        toast.success("Quote saved · sent for pricing approval");
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

  const visiveis = rows
    .filter((row) => inRange(row.created_at, range))
    .filter((row) => (row.leads?.nome_cliente ?? "").toLowerCase().includes(busca.toLowerCase()))
    .filter((row) => statusFiltro.size === 0 || statusFiltro.has(row.stage));

  const grupos = useMemo(() => {
    const porCliente = new Map<string, { nome: string; lead: LeadLike; linhas: ProposalRow[] }>();
    for (const row of visiveis) {
      const nome = row.leads?.nome_cliente?.trim() || "Unnamed client";
      const chave = nome.toLowerCase();
      const g = porCliente.get(chave);
      if (g) g.linhas.push(row);
      else porCliente.set(chave, { nome, lead: row.leads, linhas: [row] });
    }
    return [...porCliente.entries()]
      .map(([chave, g]) => ({
        chave,
        nome: g.nome,
        lead: g.lead,
        linhas: g.linhas,
        total: g.linhas.reduce((a, r) => a + (r.total_cliente ?? 0), 0),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, range, busca, statusFiltro]);

  const formDialog = (
    <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
      <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>{dialog?.mode === "edit" ? "Edit quote" : "New quote"}</DialogTitle>
        </DialogHeader>
        {dialog && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
            <span className="text-xs text-muted-foreground">Partner:</span>
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
      <PricingDialog
        proposalId={pricingRow?.id ?? null}
        clienteNome={pricingRow?.leads?.nome_cliente ?? "Client"}
        open={!!pricingRow}
        onOpenChange={(o) => !o && setPricingRow(null)}
        onChanged={load}
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
      <PageHeader title="Quotes" description="Create, review and export your client proposals." />

      {/* Filter bar fixed on scroll — compact */}
      <div className="glass-toolbar sticky top-16 z-30 -mx-4 space-y-2 px-4 py-3 sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setDialog({ mode: "create" })} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> New Quote
          </Button>
          <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
          <Button
            variant="outline"
            size="icon"
            onClick={abrirConfig}
            className="shrink-0"
            aria-label="Settings"
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
              aria-label="Search clients"
              placeholder="Search client…"
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
                  Clear filters
                </button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Proposals</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-card">Quote</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last edit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Proposal value</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => {
                    const aberto = !recolhidos.has(g.chave);
                    return (
                      <Fragment key={g.chave}>
                        <TableRow className="bg-muted/40 hover:bg-muted/60">
                          <TableCell colSpan={7} className="sticky left-0 z-10 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleGrupo(g.chave)}
                                className="flex items-center gap-1.5 text-sm font-semibold"
                                aria-expanded={aberto}
                              >
                                {aberto ? (
                                  <ChevronDownIcon className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                {g.nome}
                              </button>
                              <span className="text-xs text-muted-foreground">
                                {g.linhas.length} {g.linhas.length === 1 ? "quote" : "quotes"} ·{" "}
                                {money(g.total)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setLeadDetail(g.lead)}
                                className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
                                title="Open setter card"
                              >
                                Setter card
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {aberto &&
                          g.linhas.map((row, i) => (
                            <TableRow key={row.id}>
                              <TableCell className="sticky left-0 z-10 bg-card text-muted-foreground">
                                #{g.linhas.length - i}
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
                              <TableCell className="text-right">
                                {money(row.total_cliente)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1.5">
                                  {isRuche && (
                                    <Button
                                      size="sm"
                                      variant={
                                        row.pricing_status === "aprovado" ? "ghost" : "secondary"
                                      }
                                      onClick={() => setPricingRow(row)}
                                      title="Open the pricing of this quote"
                                    >
                                      <SlidersHorizontal className="mr-1 h-4 w-4" /> Pricing
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openDetail(row)}
                                  >
                                    <FileText className="mr-1 h-4 w-4" /> View
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                  {grupos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No quotes found.
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
  const cliente = row.leads?.nome_cliente || "Client";

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

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quote — ${cliente}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}
        h1{margin:0 0 4px} .muted{color:#666;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        td,th{border-bottom:1px solid #ddd;padding:6px}
        .total{font-size:18px;font-weight:bold;text-align:right;margin-top:16px}
      </style></head><body>
      <h1>Quote — ${cliente}</h1>
      <div class="muted">${row.leads?.endereco ?? ""}${row.leads?.endereco ? " · " : ""}${row.leads?.telefone ?? ""}</div>
      <table>
        <thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="total">Total: ${money(row.total_cliente)}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Allow pop-ups to export the PDF");
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
            <p className="text-sm text-muted-foreground">{row.leads?.endereco || "No address"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" onClick={printPdf} disabled={loading || !items.length}>
            <Printer className="mr-1 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client quote</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading items…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No priced items. Check that the Pricing Engine covers the types used.
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
                          <TableHead className="text-right">Qty</TableHead>
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
                  <p className="text-sm text-muted-foreground">Proposal value</p>
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
