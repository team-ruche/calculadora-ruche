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
  X,
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
import {
  ColumnFilter,
  colFilterActive,
  matchText,
  matchSel,
  matchNum,
  matchDate,
  type ColFilters,
  type FVal,
} from "@/components/ColumnFilter";
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
  // Navegação: nível topo (Cobrança/Tracker) e sub-visão da cobrança.
  const [topView, setTopView] = useState<"cobranca" | "tracker">("cobranca");
  const [cobrView, setCobrView] = useState<"prio" | "cli" | "parc">("prio");
  // Filtro de status na visão Parcelas (todas).
  const [statusFiltro, setStatusFiltro] = useState<"abertas" | "vencidas" | "pagas" | "todas">(
    "todas",
  );
  // Filtro por inconsistência (vindo dos cards da Prioridade). null = sem filtro.
  const [incFiltro, setIncFiltro] = useState<"semConta" | "naoRec" | "semData" | null>(null);
  const INC_LABEL: Record<"semConta" | "naoRec" | "semData", string> = {
    semConta: "Aberto sem conta definida",
    naoRec: "Recebido não reconciliado",
    semData: "Pago sem data de pagamento",
  };
  // Abre a visão Parcelas já filtrada por uma inconsistência.
  const abrirInconsistencia = (k: "semConta" | "naoRec" | "semData") => {
    setStatusFiltro("todas");
    setBusca("");
    setVencRange(null);
    setIncFiltro(k);
    setCobrView("parc");
  };
  // Parcela em edição (dialog) na visão Parcelas.
  const [parcelaEdit, setParcelaEdit] = useState<{ parcela: Parcela | null; deal: Deal } | null>(
    null,
  );
  // Filtros por coluna (Por cliente e Parcelas).
  const [fcli, setFcli] = useState<ColFilters>({});
  const [fparc, setFparc] = useState<ColFilters>({});
  const setColFcli = (k: string, v: FVal | undefined) => setFcli((s) => ({ ...s, [k]: v ?? {} }));
  const setColFparc = (k: string, v: FVal | undefined) => setFparc((s) => ({ ...s, [k]: v ?? {} }));

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

  const dealsById: Record<string, Deal> = {};
  for (const d of deals) dealsById[d.id] = d;
  const nomeDe = (d: Deal) => d.leads?.nome_cliente || "—";

  // ---- INCONSISTÊNCIAS a revisar (qualidade de dado) ----------------------
  const incAbertoSemConta = todasParcelas.filter((p) => isAberta(p) && !p.conta);
  const incRecebNaoRec = todasParcelas.filter((p) => (p.valor_pago ?? 0) > 0 && !p.conciliado);
  const incPagoSemData = todasParcelas.filter(
    (p) => (p.status === "pago" || (p.valor_pago ?? 0) > 0) && !p.data_pagamento,
  );
  const somaValor = (ps: Parcela[]) => ps.reduce((a, p) => a + (p.valor ?? 0), 0);
  const somaPago = (ps: Parcela[]) => ps.reduce((a, p) => a + (p.valor_pago ?? 0), 0);

  // ---- PRIORIDADE de cobrança: clientes com vencido, por valor × atraso ----
  const prioridade = deals
    .map((d) => {
      const ps = parcelasDe[d.id] ?? [];
      const vencidas = ps.filter((p) => isAberta(p) && bucketVenc(p) === "vencida");
      const total = vencidas.reduce((a, p) => a + (p.valor ?? 0), 0);
      const maxDias = vencidas.reduce((a, p) => Math.max(a, diasParaVenc(p) ?? 0), 0);
      return { d, nParc: vencidas.length, total, maxDias, score: total * (maxDias || 1) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.score - a.score);
  const prioTotal = prioridade.reduce((a, r) => a + r.total, 0);

  // ---- PARCELAS (todas): flat + filtros de status/busca/vencimento ---------
  const parcelasFlat = deals
    .flatMap((d) => (parcelasDe[d.id] ?? []).map((p) => ({ p, d })))
    .filter(({ p, d }) => {
      const nome = nomeDe(d).toLowerCase();
      const q = busca.toLowerCase();
      if (q && !nome.includes(q)) return false;
      if (vencRange && !inRange(p.vencimento, vencRange)) return false;
      if (incFiltro === "semConta" && !(isAberta(p) && !p.conta)) return false;
      if (incFiltro === "naoRec" && !((p.valor_pago ?? 0) > 0 && !p.conciliado)) return false;
      if (
        incFiltro === "semData" &&
        !((p.status === "pago" || (p.valor_pago ?? 0) > 0) && !p.data_pagamento)
      )
        return false;
      if (statusFiltro === "abertas" && !isAberta(p)) return false;
      if (statusFiltro === "pagas" && p.status !== "pago") return false;
      if (statusFiltro === "vencidas" && !(isAberta(p) && bucketVenc(p) === "vencida"))
        return false;
      // Filtros por coluna.
      if (!matchText(nomeDe(d), fparc.cliente)) return false;
      if (!matchSel(p.payment_method || "—", fparc.metodo)) return false;
      if (!matchNum(p.valor ?? 0, fparc.valor)) return false;
      if (!matchSel(p.conta || "—", fparc.conta)) return false;
      if (!matchDate(p.vencimento, fparc.vencimento)) return false;
      if (!matchDate(p.data_pagamento, fparc.pagoEm)) return false;
      if (!matchText(p.periodo || "", fparc.periodo)) return false;
      if (!matchSel(p.status, fparc.status)) return false;
      return true;
    })
    .sort((a, b) => (b.p.vencimento ?? "").localeCompare(a.p.vencimento ?? ""));
  const parcFaturado = parcelasFlat.reduce((a, { p }) => a + (p.valor ?? 0), 0);

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
    )
    .filter(({ d, ps, noFiltro, prox }) => {
      const pago = ps.reduce((a, p) => a + (p.valor_pago ?? 0), 0);
      const aberto = noFiltro.reduce((a, p) => a + (p.valor ?? 0), 0);
      const venc = vencidoDe(ps);
      const dias = prox ? diasParaVenc(prox) : null;
      if (!matchText(nomeDe(d), fcli.cliente)) return false;
      if (!matchSel(d.contract_status, fcli.contrato)) return false;
      if (!matchNum(d.total_cliente ?? 0, fcli.faturado)) return false;
      if (!matchNum(pago, fcli.recebido)) return false;
      if (!matchNum(aberto, fcli.aReceber)) return false;
      if (!matchNum(venc, fcli.vencido)) return false;
      if (dias == null ? colFilterActive(fcli.dias) : !matchNum(dias, fcli.dias)) return false;
      if (!matchNum(ps.length, fcli.parcelas)) return false;
      if (!matchDate(prox?.vencimento ?? null, fcli.proxVenc)) return false;
      return true;
    });

  return (
    <div className="space-y-6 overflow-x-clip">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Controle Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Cobrança dos contratos e acompanhamento das vendas.
          </p>
        </div>
        <div className="inline-flex rounded-full bg-muted p-1">
          {(
            [
              ["cobranca", "Cobrança"],
              ["tracker", "Tracker"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTopView(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                topView === v ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {topView === "cobranca" && (
        <div className="space-y-6">
          {/* KPIs de recebíveis — sempre visíveis */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="A receber" value={money(aReceberTotal)} tone="primary" icon={Wallet} />
            <Kpi
              label="Vencido (atrasado)"
              value={money(vencidoTotal)}
              tone="danger"
              icon={AlertTriangle}
            />
            <Kpi
              label="Vence em 7 dias"
              value={money(venceProx7)}
              tone="warn"
              icon={CalendarClock}
            />
            <Kpi
              label="Coletado"
              value={money(recebidoCliente)}
              sub="recebido do cliente"
              tone="success"
              icon={CheckCircle2}
            />
          </div>

          {/* Sub-abas (underline, para distinguir do toggle de topo) */}
          <div className="flex gap-5 border-b">
            {(
              [
                ["prio", "Prioridade"],
                ["cli", "Por cliente"],
                ["parc", "Parcelas (todas)"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setCobrView(v)}
                className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${
                  cobrView === v
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* ===== PRIORIDADE ===== */}
          {cobrView === "prio" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Inconsistências a revisar
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => abrirInconsistencia("semConta")}
                    className="group rounded-lg bg-card p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p>
                      <span className="text-xl font-bold" style={{ color: "#BA7517" }}>
                        {incAbertoSemConta.length}
                      </span>{" "}
                      <span className="text-sm text-muted-foreground">
                        {money(somaValor(incAbertoSemConta))}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      Aberto sem conta definida
                      <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirInconsistencia("naoRec")}
                    className="group rounded-lg bg-card p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p>
                      <span className="text-xl font-bold" style={{ color: "#BA7517" }}>
                        {incRecebNaoRec.length}
                      </span>{" "}
                      <span className="text-sm text-muted-foreground">
                        {money(somaPago(incRecebNaoRec))}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      Recebido não reconciliado
                      <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirInconsistencia("semData")}
                    className="group rounded-lg bg-card p-3 text-left transition-colors hover:bg-accent"
                  >
                    <p>
                      <span className="text-xl font-bold" style={{ color: "#BA7517" }}>
                        {incPagoSemData.length}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      Pago sem data de pagamento
                      <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </p>
                  </button>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 font-semibold text-destructive">
                        <AlertTriangle className="h-4 w-4" /> Prioridade de cobrança
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Clientes com parcelas vencidas, ranqueados por valor × atraso.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold tabular-nums text-destructive">
                        {money(prioTotal)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {prioridade.length} clientes vencidos
                      </p>
                    </div>
                  </div>
                  {prioridade.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum cliente com parcela vencida.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Contrato</TableHead>
                          <TableHead className="text-center">Dias</TableHead>
                          <TableHead className="text-center">Parcelas</TableHead>
                          <TableHead className="text-right">Vencido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {prioridade.map((r, i) => {
                          const cc = CONTRACT_STATUS_COLOR[r.d.contract_status];
                          return (
                            <TableRow
                              key={r.d.id}
                              className="cursor-pointer transition-colors hover:bg-muted/40"
                              onClick={() => setSelected(r.d)}
                            >
                              <TableCell className="text-sm text-muted-foreground">
                                {i + 1}
                              </TableCell>
                              <TableCell className="font-medium">{nomeDe(r.d)}</TableCell>
                              <TableCell>
                                <span
                                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                                  style={{ background: cc.bg, color: cc.fg }}
                                >
                                  {CONTRACT_STATUS_LABEL[r.d.contract_status]}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                <DiasBadge dias={r.maxDias} />
                              </TableCell>
                              <TableCell className="text-center text-sm">{r.nParc}</TableCell>
                              <TableCell className="text-right font-bold tabular-nums text-destructive">
                                {money(r.total)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===== POR CLIENTE ===== */}
          {cobrView === "cli" && (
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
                  <div className="inline-flex max-w-full shrink overflow-x-auto rounded-lg border bg-background p-0.5">
                    {(["todas", "vencida", "prox7", "depois"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVencFiltro(v)}
                        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${
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
                  <div className="overflow-x-auto">
                    <Table className="min-w-[820px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-20 w-8 bg-card" />
                          <TableHead className="sticky left-8 z-20 bg-card">
                            Cliente
                            <ColumnFilter
                              type="text"
                              value={fcli.cliente}
                              onChange={(v) => setColFcli("cliente", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Contrato
                            <ColumnFilter
                              type="select"
                              options={Object.keys(CONTRACT_STATUS_LABEL)}
                              labelFor={(o) => CONTRACT_STATUS_LABEL[o as ContractStatus]}
                              value={fcli.contrato}
                              onChange={(v) => setColFcli("contrato", v)}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            Faturado
                            <ColumnFilter
                              type="num"
                              value={fcli.faturado}
                              onChange={(v) => setColFcli("faturado", v)}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            Recebido
                            <ColumnFilter
                              type="num"
                              value={fcli.recebido}
                              onChange={(v) => setColFcli("recebido", v)}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            {vencFiltro === "todas" ? "A receber" : VENC_LABEL[vencFiltro]}
                            <ColumnFilter
                              type="num"
                              align="end"
                              value={fcli.aReceber}
                              onChange={(v) => setColFcli("aReceber", v)}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            Vencido
                            <ColumnFilter
                              type="num"
                              align="end"
                              value={fcli.vencido}
                              onChange={(v) => setColFcli("vencido", v)}
                            />
                          </TableHead>
                          <TableHead className="text-center">
                            Dias
                            <ColumnFilter
                              type="num"
                              align="end"
                              value={fcli.dias}
                              onChange={(v) => setColFcli("dias", v)}
                            />
                          </TableHead>
                          <TableHead className="text-center">
                            Parcelas
                            <ColumnFilter
                              type="num"
                              align="end"
                              value={fcli.parcelas}
                              onChange={(v) => setColFcli("parcelas", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Próx. vencimento
                            <ColumnFilter
                              type="date"
                              align="end"
                              value={fcli.proxVenc}
                              onChange={(v) => setColFcli("proxVenc", v)}
                            />
                          </TableHead>
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
                                <TableCell className="sticky left-0 z-10 w-8 bg-card text-muted-foreground">
                                  {aberto0 ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </TableCell>
                                <TableCell className="sticky left-8 z-10 bg-card font-medium">
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
                                      {(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map(
                                        (s) => (
                                          <SelectItem key={s} value={s}>
                                            {CONTRACT_STATUS_LABEL[s]}
                                          </SelectItem>
                                        ),
                                      )}
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
                                        <p className="text-sm text-muted-foreground">
                                          Sem parcelas.
                                        </p>
                                      ) : (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-8">#</TableHead>
                                              <TableHead>Vencimento</TableHead>
                                              <TableHead>Forma</TableHead>
                                              <TableHead className="text-right">Valor</TableHead>
                                              <TableHead className="text-right">
                                                Parte Ruche
                                              </TableHead>
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
                                                    ? new Date(p.vencimento).toLocaleDateString(
                                                        "pt-BR",
                                                      )
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===== PARCELAS (todas) ===== */}
          {cobrView === "parc" && (
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
                  <div className="inline-flex max-w-full shrink overflow-x-auto rounded-lg border bg-background p-0.5">
                    {(
                      [
                        ["abertas", "Abertas"],
                        ["vencidas", "Vencidas"],
                        ["pagas", "Pagas"],
                        ["todas", "Todas"],
                      ] as const
                    ).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setStatusFiltro(v);
                          setIncFiltro(null);
                        }}
                        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${
                          statusFiltro === v
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <DateRangePicker
                    value={vencRange}
                    onChange={setVencRange}
                    clearable
                    placeholder="Vencimento: todas as datas"
                  />
                  <Select
                    value=""
                    onValueChange={(id) => {
                      const d = dealsById[id];
                      if (d) setParcelaEdit({ parcela: null, deal: d });
                    }}
                  >
                    <SelectTrigger className="h-9 w-[170px]">
                      <span className="flex items-center gap-1 text-sm">
                        <Plus className="h-4 w-4" /> Nova cobrança
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {deals.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {nomeDe(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {incFiltro && (
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
                      style={{ background: "#FAEEDA", color: "#7A4E05" }}
                    >
                      Filtrando: {INC_LABEL[incFiltro]}
                      <button
                        type="button"
                        onClick={() => setIncFiltro(null)}
                        aria-label="Limpar filtro"
                        className="hover:opacity-70"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                )}

                {/* KPIs contextuais — só o que é específico desta visão */}
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <Kpi
                    label="Parcelas no filtro"
                    value={String(parcelasFlat.length)}
                    icon={FileText}
                  />
                  <Kpi label="Total faturado" value={money(parcFaturado)} icon={Wallet} />
                </div>

                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[760px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-20 bg-card">
                            Cliente
                            <ColumnFilter
                              type="text"
                              value={fparc.cliente}
                              onChange={(v) => setColFparc("cliente", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Método
                            <ColumnFilter
                              type="select"
                              options={[...PAYMENT_METHODS, "—"]}
                              value={fparc.metodo}
                              onChange={(v) => setColFparc("metodo", v)}
                            />
                          </TableHead>
                          <TableHead className="text-right">
                            Valor
                            <ColumnFilter
                              type="num"
                              value={fparc.valor}
                              onChange={(v) => setColFparc("valor", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Conta
                            <ColumnFilter
                              type="select"
                              options={[...CONTAS, "—"]}
                              value={fparc.conta}
                              onChange={(v) => setColFparc("conta", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Vencimento
                            <ColumnFilter
                              type="date"
                              align="end"
                              value={fparc.vencimento}
                              onChange={(v) => setColFparc("vencimento", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Pago em
                            <ColumnFilter
                              type="date"
                              align="end"
                              value={fparc.pagoEm}
                              onChange={(v) => setColFparc("pagoEm", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Período
                            <ColumnFilter
                              type="text"
                              align="end"
                              value={fparc.periodo}
                              onChange={(v) => setColFparc("periodo", v)}
                            />
                          </TableHead>
                          <TableHead>
                            Status
                            <ColumnFilter
                              type="select"
                              align="end"
                              options={Object.keys(PARCELA_STATUS_LABEL)}
                              labelFor={(o) => PARCELA_STATUS_LABEL[o as ParcelaStatus]}
                              value={fparc.status}
                              onChange={(v) => setColFparc("status", v)}
                            />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parcelasFlat.map(({ p, d }) => (
                          <TableRow
                            key={p.id}
                            className="cursor-pointer transition-colors hover:bg-muted/40"
                            onClick={() => setParcelaEdit({ parcela: p, deal: d })}
                          >
                            <TableCell className="sticky left-0 z-10 bg-card font-medium">
                              {nomeDe(d)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.payment_method || "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(p.valor)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.conta || "—"}
                            </TableCell>
                            <TableCell>
                              {p.vencimento
                                ? new Date(p.vencimento).toLocaleDateString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {p.data_pagamento
                                ? new Date(p.data_pagamento).toLocaleDateString("pt-BR")
                                : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.periodo || "—"}
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
                        {parcelasFlat.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              Nenhuma parcela neste filtro.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {topView === "tracker" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
      )}

      {parcelaEdit && (
        <ParcelaDialog
          open={true}
          parcela={parcelaEdit.parcela}
          proposalId={parcelaEdit.deal.id}
          cliente={nomeDe(parcelaEdit.deal)}
          proximoNumero={(parcelasDe[parcelaEdit.deal.id]?.at(-1)?.numero ?? 0) + 1}
          onOpenChange={(o) => !o && setParcelaEdit(null)}
          onSaved={() => {
            setParcelaEdit(null);
            load();
          }}
        />
      )}
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
          <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
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
          </div>
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
