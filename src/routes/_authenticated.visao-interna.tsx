import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Plus,
  FileText,
  Search,
  ChevronRight,
  ChevronDown,
  Clock,
  Wallet,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  TrendingUp,
  Users,
  Building2,
  type LucideIcon,
} from "lucide-react";
import {
  supabase,
  type Proposal,
  type Parcela,
  type ParcelaStatus,
  type ContractStatus,
  type Direcao,
  PARCELA_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  PAYMENT_METHODS,
  CONTAS,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ParcelaDialog } from "@/components/ParcelaDialog";
import { DateRangePicker, presetRange } from "@/components/DateRangePicker";
import { ChartFaturamento } from "@/components/ChartFaturamento";
import { toast } from "sonner";

type Range = { from: Date; to: Date };
const inRange = (iso: string | null, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
};

export const Route = createFileRoute("/_authenticated/visao-interna")({
  head: () => ({ meta: [{ title: "Controle Financeiro · Ruche" }] }),
  component: VisaoInternaPage,
});

type Deal = Proposal & { leads: { nome_cliente: string } | null };

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const PARCELA_BADGE: Record<ParcelaStatus, { bg: string; fg: string }> = {
  pago: { bg: "#D3E8BC", fg: "#2C5212" },
  em_dia: { bg: "#E6F1FB", fg: "#0C447C" },
  vence_7d: { bg: "#FBE7BF", fg: "#7A4E05" },
  vence_hoje: { bg: "#FAC775", fg: "#633806" },
  em_atraso: { bg: "#F7C1C1", fg: "#791F1F" },
  negociacao: { bg: "#F5DDB4", fg: "#7A4405" },
  processing: { bg: "#D3D1C7", fg: "#2C2C2A" },
};

const recebidoDe = (ps: Parcela[]) =>
  ps.reduce((a, p) => a + (p.status === "pago" ? (p.valor_pago ?? p.valor) : 0), 0);

// Escala de cor do status do contrato.
const CONTRACT_STATUS_COLOR: Record<ContractStatus, { bg: string; fg: string }> = {
  active: { bg: "#D3E8BC", fg: "#2C5212" },
  pending: { bg: "#FBE7BF", fg: "#7A4E05" },
  on_hold: { bg: "#E6F1FB", fg: "#0C447C" },
  contractual_billing: { bg: "#F5DDB4", fg: "#7A4405" },
  encerrado: { bg: "#DEDCD2", fg: "#45443D" },
};

// Bucket de vencimento de uma parcela aberta (não paga).
type VencBucket = "vencida" | "prox7" | "depois";
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const bucketVenc = (p: Parcela): VencBucket => {
  if (!p.vencimento) return "depois";
  const hoje = startOfToday().getTime();
  const venc = new Date(p.vencimento).getTime();
  if (venc < hoje) return "vencida";
  if (venc <= hoje + 7 * 86400000) return "prox7";
  return "depois";
};
const isAberta = (p: Parcela) => p.status !== "pago";
const abertoDe = (ps: Parcela[]) => ps.filter(isAberta).reduce((a, p) => a + (p.valor ?? 0), 0);
const vencidoDe = (ps: Parcela[]) =>
  ps
    .filter((p) => isAberta(p) && bucketVenc(p) === "vencida")
    .reduce((a, p) => a + (p.valor ?? 0), 0);

const VENC_LABEL: Record<"todas" | VencBucket, string> = {
  todas: "Todas",
  vencida: "Vencidas",
  prox7: "Próximos 7 dias",
  depois: "Após 7 dias",
};

// Dias em relação ao vencimento: negativo = falta vencer, 0 = vence hoje, positivo = atraso.
const diasParaVenc = (p: Parcela): number | null => {
  if (!p.vencimento) return null;
  const venc = new Date(p.vencimento);
  venc.setHours(0, 0, 0, 0);
  return Math.round((startOfToday().getTime() - venc.getTime()) / 86400000);
};

// Parcela aberta mais urgente (menor vencimento) de um conjunto.
const maisUrgente = (ps: Parcela[]): Parcela | null =>
  ps
    .filter((p) => p.vencimento)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))[0] ?? null;

function DiasBadge({ dias }: { dias: number | null }) {
  if (dias === null) return <span className="text-muted-foreground">—</span>;
  const atrasoOuHoje = dias >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
      style={{
        background: atrasoOuHoje ? "#F7C1C1" : "#FBE7BF",
        color: atrasoOuHoje ? "#791F1F" : "#7A4E05",
      }}
    >
      <Clock className="h-3 w-3" />
      {dias}d
    </span>
  );
}

// ---- KPI unificado ----------------------------------------------------------
type Tone = "neutral" | "primary" | "danger" | "warn" | "success" | "dark";
const KPI_TONE: Record<Tone, { value: string; iconBg: string; iconFg: string }> = {
  neutral: { value: "", iconBg: "#F1F0EB", iconFg: "#45443D" },
  primary: { value: "#0C447C", iconBg: "#E6F1FB", iconFg: "#0C447C" },
  danger: { value: "#B42318", iconBg: "#FDECEC", iconFg: "#B42318" },
  warn: { value: "#7A4E05", iconBg: "#FBEFD6", iconFg: "#7A4E05" },
  success: { value: "#2C7A3F", iconBg: "#E7F4E4", iconFg: "#2C5212" },
  dark: { value: "#FFFFFF", iconBg: "rgba(240,168,30,0.18)", iconFg: "#F0A81E" },
};

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const t = KPI_TONE[tone];
  const isDark = tone === "dark";
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${isDark ? "border-transparent" : "bg-card"}`}
      style={isDark ? { background: "#2C2C2A" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-xs font-medium uppercase tracking-wide ${isDark ? "text-[#D3D1C7]" : "text-muted-foreground"}`}
          >
            {label}
          </p>
          <p
            className="mt-1.5 text-2xl font-bold tabular-nums"
            style={t.value ? { color: t.value } : undefined}
          >
            {value}
          </p>
          {sub && (
            <p className={`mt-1 text-xs ${isDark ? "text-[#B4B2A9]" : "text-muted-foreground"}`}>
              {sub}
            </p>
          )}
        </div>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: t.iconBg, color: t.iconFg }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
    </div>
  );
}

function SectionTitle({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{children}</h2>
    </div>
  );
}

function VisaoInternaPage() {
  const { isRuche } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [vencFiltro, setVencFiltro] = useState<"todas" | VencBucket>("todas");
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpandido((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Filtro por data de fechamento do deal (bloco "Vendas no período").
  const [range, setRange] = useState<Range>(() => presetRange("mes"));
  // Filtro por data de VENCIMENTO na tabela de cobrança (null = todas as datas).
  const [vencRange, setVencRange] = useState<Range | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: dealData, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente)")
      .eq("stage", "deal")
      .order("fechado_at", { ascending: false });
    if (error) toast.error(error.message);
    const ds = (dealData as Deal[]) ?? [];
    setDeals(ds);

    if (ds.length) {
      const { data: pData } = await supabase
        .from("parcelas")
        .select("*")
        .in(
          "proposal_id",
          ds.map((d) => d.id),
        )
        .order("numero");
      setParcelas((pData as Parcela[]) ?? []);
    } else {
      setParcelas([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  const parcelasDe = useMemo(() => {
    const m: Record<string, Parcela[]> = {};
    for (const p of parcelas) (m[p.proposal_id] ??= []).push(p);
    return m;
  }, [parcelas]);

  if (!isRuche) return <Navigate to="/overview" />;

  // ---- COBRANÇA (independente do filtro de data) --------------------------
  // Recebíveis são dirigidos pelo VENCIMENTO da parcela, não pela data de venda.
  // Assim parcelas atrasadas de deals antigos e as que vão vencer sempre aparecem.
  const todasParcelas = deals.flatMap((d) => parcelasDe[d.id] ?? []);
  const recebidoCliente = todasParcelas.reduce((a, p) => a + (p.valor_pago ?? 0), 0);
  const aReceberTotal = abertoDe(todasParcelas);
  const vencidoTotal = vencidoDe(todasParcelas);
  const venceProx7 = todasParcelas
    .filter((p) => isAberta(p) && bucketVenc(p) === "prox7")
    .reduce((a, p) => a + (p.valor ?? 0), 0);

  // ---- VENDAS NO PERÍODO (filtrado por data de fechamento) ----------------
  const dealsNoPeriodo = deals.filter((d) => inRange(d.fechado_at, range));
  const totalVendido = dealsNoPeriodo.reduce((a, d) => a + (d.total_cliente ?? 0), 0);
  const totalParceiro = dealsNoPeriodo.reduce((a, d) => a + (d.total_repasse ?? 0), 0);
  const totalRuche = dealsNoPeriodo.reduce((a, d) => a + (d.margem_ruche ?? 0), 0);

  const setContrato = async (id: string, cs: ContractStatus) => {
    const { error } = await supabase.from("proposals").update({ contract_status: cs }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (selected) {
    return (
      <DealDetail
        deal={selected}
        parcelas={parcelasDe[selected.id] ?? []}
        onBack={() => {
          setSelected(null);
          load();
        }}
        onChanged={load}
      />
    );
  }

  // Tabela de cobrança: TODOS os deals. Filtra por busca, bucket e data de vencimento.
  const noVencRange = (p: Parcela) => !vencRange || inRange(p.vencimento, vencRange);
  const linhas = deals
    .filter((d) => (d.leads?.nome_cliente ?? "").toLowerCase().includes(busca.toLowerCase()))
    .map((d) => {
      const ps = parcelasDe[d.id] ?? [];
      const abertas = ps.filter(isAberta);
      let noFiltro =
        vencFiltro === "todas" ? abertas : abertas.filter((p) => bucketVenc(p) === vencFiltro);
      noFiltro = noFiltro.filter(noVencRange);
      return { d, ps, noFiltro, prox: maisUrgente(noFiltro) };
    })
    .filter(({ ps, noFiltro }) =>
      vencFiltro === "todas" && !vencRange ? ps.length > 0 : noFiltro.length > 0,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Controle Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Cobrança por vencimento (sempre visível) e vendas fechadas no período selecionado.
        </p>
      </div>

      {/* ===== COBRANÇA / RECEBÍVEIS (não depende de data) ===== */}
      <div className="space-y-3">
        <SectionTitle dot="#0C447C">Cobrança · todos os contratos</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="A receber" value={money(aReceberTotal)} tone="primary" icon={Wallet} />
          <Kpi
            label="Vencido (atrasado)"
            value={money(vencidoTotal)}
            tone="danger"
            icon={AlertTriangle}
          />
          <Kpi label="Vence em 7 dias" value={money(venceProx7)} tone="warn" icon={CalendarClock} />
          <Kpi
            label="Coletado"
            value={money(recebidoCliente)}
            sub="recebido do cliente"
            tone="success"
            icon={CheckCircle2}
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="inline-flex rounded-lg border bg-background p-0.5">
              {(["todas", "vencida", "prox7", "depois"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVencFiltro(v)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    vencFiltro === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {VENC_LABEL[v]}
                </button>
              ))}
            </div>
            <DateRangePicker
              value={vencRange}
              onChange={setVencRange}
              clearable
              placeholder="Vencimento: todas as datas"
            />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-right">Faturado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">
                    {vencFiltro === "todas" ? "A receber" : VENC_LABEL[vencFiltro]}
                  </TableHead>
                  <TableHead className="text-right">Vencido</TableHead>
                  <TableHead className="text-center">Dias</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead>Próx. vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map(({ d, ps, noFiltro, prox }) => {
                  const pagas = ps.filter((p) => p.status === "pago").length;
                  const pago = ps.reduce((a, p) => a + (p.valor_pago ?? 0), 0);
                  const aberto = noFiltro.reduce((a, p) => a + (p.valor ?? 0), 0);
                  const venc = vencidoDe(ps);
                  const dias = prox ? diasParaVenc(prox) : null;
                  const cc = CONTRACT_STATUS_COLOR[d.contract_status];
                  const aberto0 = expandido.has(d.id);
                  return (
                    <Fragment key={d.id}>
                      <TableRow
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                        onClick={() => toggle(d.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {aberto0 ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {d.leads?.nome_cliente || "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={d.contract_status}
                            onValueChange={(v) => setContrato(d.id, v as ContractStatus)}
                          >
                            <SelectTrigger
                              className="h-7 w-[150px] rounded-full border-none text-xs font-semibold"
                              style={{ background: cc.bg, color: cc.fg }}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => (
                                <SelectItem key={s} value={s}>
                                  {CONTRACT_STATUS_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(d.total_cliente)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {money(pago)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(aberto)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${venc > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
                        >
                          {money(venc)}
                        </TableCell>
                        <TableCell className="text-center">
                          <DiasBadge dias={dias} />
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {pagas}/{ps.length}
                        </TableCell>
                        <TableCell className="text-sm">
                          {prox?.vencimento
                            ? new Date(prox.vencimento).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                      </TableRow>
                      {aberto0 && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={9} className="py-3">
                            <div className="rounded-lg border bg-card p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Parcelas de {d.leads?.nome_cliente || "—"}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(d);
                                  }}
                                >
                                  Abrir e editar
                                </Button>
                              </div>
                              {ps.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Sem parcelas.</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-8">#</TableHead>
                                      <TableHead>Vencimento</TableHead>
                                      <TableHead>Forma</TableHead>
                                      <TableHead className="text-right">Valor</TableHead>
                                      <TableHead className="text-right">Parte Ruche</TableHead>
                                      <TableHead className="text-right">Pago</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {ps.map((p) => (
                                      <TableRow key={p.id}>
                                        <TableCell>{p.numero}</TableCell>
                                        <TableCell>
                                          {p.vencimento
                                            ? new Date(p.vencimento).toLocaleDateString("pt-BR")
                                            : "—"}
                                        </TableCell>
                                        <TableCell>{p.payment_method || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {money(p.valor)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">
                                          {money(p.valor_ruche)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {p.valor_pago != null ? money(p.valor_pago) : "—"}
                                        </TableCell>
                                        <TableCell>
                                          <span
                                            className="rounded-full px-2.5 py-1 text-xs font-medium"
                                            style={{
                                              background: PARCELA_BADGE[p.status].bg,
                                              color: PARCELA_BADGE[p.status].fg,
                                            }}
                                          >
                                            {PARCELA_STATUS_LABEL[p.status]}
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      {vencFiltro === "todas"
                        ? "Nenhum deal com parcelas."
                        : `Nenhuma parcela ${VENC_LABEL[vencFiltro].toLowerCase()}.`}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== VENDAS NO PERÍODO (filtrado por data de fechamento) ===== */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <SectionTitle dot="#F0A81E">Vendas no período</SectionTitle>
        <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Total vendido"
          value={money(totalVendido)}
          sub={`${dealsNoPeriodo.length} deals fechados`}
          tone="dark"
          icon={TrendingUp}
        />
        <Kpi
          label="Total parceiro"
          value={money(totalParceiro)}
          sub="fica com o parceiro"
          icon={Users}
        />
        <Kpi
          label="Total Ruche"
          value={money(totalRuche)}
          sub="margem da Ruche no período"
          icon={Building2}
        />
      </div>

      <ChartFaturamento deals={dealsNoPeriodo} />
    </div>
  );
}

// ---- Detalhe do deal --------------------------------------------------------
function DealDetail({
  deal,
  parcelas,
  onBack,
  onChanged,
}: {
  deal: Deal;
  parcelas: Parcela[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Parcela | "novo" | null>(null);
  const receb = recebidoDe(parcelas);
  const cliente = deal.leads?.nome_cliente ?? "Cliente";

  const proximoNumero = (parcelas.at(-1)?.numero ?? 0) + 1;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{cliente}</h1>
          <p className="text-sm text-muted-foreground">
            Deal · {CONTRACT_STATUS_LABEL[deal.contract_status]}
            {deal.fechado_at
              ? ` · fechado ${new Date(deal.fechado_at).toLocaleDateString("pt-BR")}`
              : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing("novo")}>
          <Plus className="mr-1 h-4 w-4" /> Nova parcela
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi label="Vendido" value={money(deal.total_cliente)} />
        <MiniKpi label="Parceiro" value={money(deal.total_repasse)} />
        <MiniKpi label="Ruche" value={money(deal.margem_ruche)} />
        <MiniKpi label="Recebido" value={money(receb)} success />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Parte Ruche</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setEditing(p)}>
                  <TableCell>{p.numero}</TableCell>
                  <TableCell>
                    {p.vencimento ? new Date(p.vencimento).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>{p.periodo || "—"}</TableCell>
                  <TableCell>{p.payment_method || "—"}</TableCell>
                  <TableCell>{p.conta || "—"}</TableCell>
                  <TableCell className="text-right">{money(p.valor)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {money(p.valor_ruche)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.valor_pago != null ? money(p.valor_pago) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: PARCELA_BADGE[p.status].bg,
                        color: PARCELA_BADGE[p.status].fg,
                      }}
                    >
                      {PARCELA_STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {parcelas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhuma parcela. As parcelas vêm acordadas na venda, ou adicione manualmente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ParcelaDialog
        open={editing !== null}
        parcela={editing === "novo" ? null : editing}
        proposalId={deal.id}
        cliente={cliente}
        proximoNumero={proximoNumero}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}

function MiniKpi({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${success ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}
