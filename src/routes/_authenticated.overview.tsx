import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  MessageSquare,
  Calendar as CalendarIcon,
  CalendarDays,
  LayoutGrid,
  ExternalLink,
  ClipboardList,
  MapPin,
  DollarSign,
  Eye,
  ArrowDownAZ,
  Search,
} from "lucide-react";
import {
  supabase,
  callGhlSync,
  type Proposal,
  type ProposalStage,
  type LeadQualificacao,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { OrcamentoForm } from "@/components/OrcamentoForm";
import { OrcamentoView } from "@/components/OrcamentoView";
import { useIsMobile } from "@/hooks/use-mobile";
import { DateRangePicker, presetRange } from "@/components/DateRangePicker";
import { PipelineCalendar, startOfWeek } from "@/components/PipelineCalendar";
import { LeadDetalhe } from "@/components/LeadDetalhe";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Fallback pra quando a proposal ainda não tem location_id gravado (leads
// criados antes da etapa10). Hoje só existe 1 cliente rodando o sync.
const GHL_DEFAULT_LOCATION_ID = "jl5iFelWb5hiWu9FIeiD";

type ViewMode = "kanban" | "calendar";
type SortBy = "visita" | "alpha" | "created";
const SORT_LABEL: Record<SortBy, string> = {
  visita: "Data da visita",
  alpha: "Ordem alfabética",
  created: "Data de criação",
};

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview · Ruche" }] }),
  component: Overview,
});

type Row = Proposal & {
  leads: {
    nome_cliente: string;
    endereco: string | null;
    telefone: string | null;
    email: string | null;
    qualificacao: LeadQualificacao | null;
  } | null;
};

type Range = { from: Date; to: Date };

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (num: number, den: number) => (den === 0 ? "0%" : `${Math.round((num / den) * 100)}%`);

const inRange = (iso: string | null, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
};

const visitLabel = (iso: string | null) => {
  if (!iso) return "Visita a agendar";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Cores por estágio — tons com bom contraste (texto sempre no 900 da família).
const STAGE_COLOR: Record<
  ProposalStage,
  { bar: string; text: string; head: string; headText: string }
> = {
  appointment_confirmed: { bar: "#F0A81E", text: "#3D2600", head: "#FBE7BF", headText: "#7A4E05" },
  appointment_canceled: { bar: "#E07A52", text: "#3D1405", head: "#F6D6C7", headText: "#7A2E12" },
  negotiation: { bar: "#185FA5", text: "#042C53", head: "#E6F1FB", headText: "#0C447C" },
  no_deal: { bar: "#9C9A90", text: "#26251F", head: "#DEDCD2", headText: "#45443D" },
  deal: { bar: "#5FA13B", text: "#173404", head: "#D3E8BC", headText: "#2C5212" },
};

const REALIZADAS: ProposalStage[] = ["negotiation", "no_deal", "deal"];

// Orçamento feito = tem valor calculado. É o gate para ir a Negociação.
const orcamentoFeito = (r: Row) => r.total_cliente != null && r.total_cliente > 0;

function Overview() {
  const { user, isRuche } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(() => presetRange("mes"));
  // Formulário de orçamento (= formulário de medição). advance move p/ negociação ao salvar.
  const [orc, setOrc] = useState<{ row: Row; advance: boolean } | null>(null);
  const [orcView, setOrcView] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [sortBy, setSortBy] = useState<SortBy>("visita");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [busca, setBusca] = useState("");
  const isMobile = useIsMobile();
  const [mobileStage, setMobileStage] = useState<ProposalStage>("appointment_confirmed");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente, endereco, telefone, email, qualificacao)")
      .order("visita_at", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const visitRows = useMemo(() => rows.filter((r) => inRange(r.visita_at, range)), [rows, range]);

  const byStage = useMemo(() => {
    const m: Record<ProposalStage, Row[]> = {
      appointment_confirmed: [],
      appointment_canceled: [],
      negotiation: [],
      no_deal: [],
      deal: [],
    };
    const q = busca.trim().toLowerCase();
    for (const r of visitRows) {
      if (q && !(r.leads?.nome_cliente ?? "").toLowerCase().includes(q)) continue;
      (m[r.stage] ?? m.appointment_confirmed).push(r);
    }
    const cmp = (a: Row, b: Row) => {
      if (sortBy === "alpha")
        return (a.leads?.nome_cliente ?? "").localeCompare(b.leads?.nome_cliente ?? "");
      if (sortBy === "created")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // visita: mais próxima primeiro (nulos por último)
      const ta = a.visita_at ? new Date(a.visita_at).getTime() : Infinity;
      const tb = b.visita_at ? new Date(b.visita_at).getTime() : Infinity;
      return ta - tb;
    };
    for (const s of STAGE_ORDER) m[s].sort(cmp);
    return m;
  }, [visitRows, sortBy, busca]);

  const count = (s: ProposalStage) => byStage[s].length;
  const sumStage = (s: ProposalStage) => byStage[s].reduce((a, r) => a + (r.total_cliente ?? 0), 0);

  const totais = visitRows.length;
  const realizadas = visitRows.filter((r) => REALIZADAS.includes(r.stage)).length;
  const deals = visitRows.filter((r) => r.stage === "deal").length;
  const pipeline = visitRows
    .filter((r) => r.stage === "negotiation")
    .reduce((a, r) => a + (r.total_cliente ?? 0), 0);
  const vendaFechada = rows
    .filter((r) => r.stage === "deal" && inRange(r.fechado_at, range))
    .reduce((a, r) => a + (r.total_cliente ?? 0), 0);

  const changeStage = async (row: Row, next: ProposalStage) => {
    if (row.stage === next) return;
    // Gate: só entra em Negociação com o orçamento (medição) preenchido.
    if (next === "negotiation" && !orcamentoFeito(row)) {
      toast.info("Preencha o orçamento (medição) para mover para Negociação.");
      setOrc({ row, advance: true });
      return;
    }
    const { error } = await supabase.from("proposals").update({ stage: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();

    // Cancelamento feito no site precisa espelhar pro GHL — Confirmed/Canceled
    // é estágio que o GHL também é dono, então ele tem que saber. Deal/No Deal
    // ficam só como destino do sync que vem do GHL (o closer decide lá).
    if (next === "appointment_canceled" && row.ghl_opportunity_id) {
      try {
        await callGhlSync("cancel_appointment", row.id);
      } catch (e) {
        toast.error("Cancelado no site, mas falhou ao avisar o GHL — verifique manualmente.");
      }
    }
  };

  const onOrcSaved = async () => {
    const current = orc;
    setOrc(null);
    await load();
    if (current?.advance && current.row.stage === "appointment_confirmed") {
      await supabase.from("proposals").update({ stage: "negotiation" }).eq("id", current.row.id);
      await load();
      // Medição + orçamento prontos → manda link do orçamento e resumo do
      // escopo pro GHL (não muda stage lá, só anexa dado pro closer ver).
      if (current.row.ghl_opportunity_id) {
        try {
          await callGhlSync("push_quote_ready", current.row.id);
        } catch (e) {
          toast.error("Orçamento salvo, mas falhou ao enviar pro GHL — verifique manualmente.");
        }
      }
    }
  };

  // Ao clicar no orçamento: se já criado, abre o documento; senão, abre o formulário.
  const abrirOrcamento = (row: Row) => {
    if (orcamentoFeito(row)) setOrcView(row);
    else setOrc({ row, advance: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Bem-vindo, {user?.nome || user?.email}.{" "}
            {isRuche ? "Você tem acesso total." : "Você é parceiro."}
          </p>
        </div>
        <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Funnel counts={{ count }} totais={totais} className="lg:col-span-2" />
        <div className="space-y-3">
          <MetricBox label="Visitas realizadas" value={pct(realizadas, totais)} />
          <MetricBox label="Deal / Negociação" value={pct(deals, realizadas)} />
          <MetricBox label="Pipeline em negociação" value={money(pipeline)} />
          <MetricBox label="Venda fechada" value={money(vendaFechada)} success />
        </div>
      </div>

      {/* Toolbar: alternador de visão + ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <CalendarDays className="h-4 w-4" /> Calendário
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-1.5 sm:w-auto">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full bg-transparent text-sm outline-none sm:w-40"
            />
          </div>
          {view === "kanban" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <ArrowDownAZ className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-9 w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SORT_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {view === "calendar" ? (
        <PipelineCalendar
          rows={rows.filter((r) =>
            (r.leads?.nome_cliente ?? "").toLowerCase().includes(busca.trim().toLowerCase()),
          )}
          weekStart={weekStart}
          onWeekStart={setWeekStart}
          onSelect={(id) => {
            const r = rows.find((x) => x.id === id);
            if (r) setDetail(r);
          }}
          onChangeStage={(id, next) => {
            const r = rows.find((x) => x.id === id);
            if (r) changeStage(r, next);
          }}
          onOrcamento={(id) => {
            const r = rows.find((x) => x.id === id);
            if (r) abrirOrcamento(r);
          }}
        />
      ) : isMobile ? (
        // Mobile: abas de estágio (sem scroll lateral de cards) + coluna única.
        <div>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {STAGE_ORDER.map((s) => {
              const active = mobileStage === s;
              const c = STAGE_COLOR[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMobileStage(s)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={
                    active
                      ? { background: c.bar, color: "#fff" }
                      : { background: c.head, color: c.headText }
                  }
                >
                  {STAGE_LABEL[s]} · {count(s)}
                </button>
              );
            })}
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-2">
            <div
              className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                background: STAGE_COLOR[mobileStage].head,
                color: STAGE_COLOR[mobileStage].headText,
              }}
            >
              <span>{STAGE_LABEL[mobileStage]}</span>
              <span>Total: {money(sumStage(mobileStage))}</span>
            </div>
            <div className="flex flex-col gap-2">
              {loading && <p className="p-2 text-xs text-muted-foreground">Carregando…</p>}
              {!loading && byStage[mobileStage].length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">Nenhum card neste estágio.</p>
              )}
              {byStage[mobileStage].map((row) => (
                <KanbanCard
                  key={row.id}
                  row={row}
                  onDragStart={() => setDragId(row.id)}
                  onOrcamento={() => abrirOrcamento(row)}
                  onDetail={() => setDetail(row)}
                  onStageChange={(next) => changeStage(row, next)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const row = rows.find((r) => r.id === dragId);
                setDragId(null);
                if (row) changeStage(row, stage);
              }}
              className="flex flex-col rounded-xl border border-border/60 bg-muted/30 p-2"
            >
              <div
                className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: STAGE_COLOR[stage].head, color: STAGE_COLOR[stage].headText }}
              >
                <span>{STAGE_LABEL[stage]}</span>
                <span className="rounded-full bg-background/70 px-1.5">{count(stage)}</span>
              </div>
              <div className="flex flex-col gap-2">
                {loading && <p className="p-2 text-xs text-muted-foreground">Carregando…</p>}
                {!loading && byStage[stage].length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">—</p>
                )}
                {byStage[stage].map((row) => (
                  <KanbanCard
                    key={row.id}
                    row={row}
                    onDragStart={() => setDragId(row.id)}
                    onOrcamento={() => abrirOrcamento(row)}
                    onDetail={() => setDetail(row)}
                    onStageChange={(next) => changeStage(row, next)}
                  />
                ))}
              </div>
              <div
                className="mt-auto flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: STAGE_COLOR[stage].head, color: STAGE_COLOR[stage].headText }}
              >
                <span>Total</span>
                <span>{money(sumStage(stage))}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de orçamento (mesmo de "Novo orçamento") */}
      <Dialog open={!!orc} onOpenChange={(o) => !o && setOrc(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Orçamento · medição</DialogTitle>
            <DialogDescription>
              Mesmo formulário de "Novo orçamento". Preenchê-lo libera a etapa de Negociação.
            </DialogDescription>
          </DialogHeader>
          {orc && (
            <OrcamentoForm
              mode="edit"
              proposalId={orc.row.id}
              onSaved={onOrcSaved}
              onCancel={() => setOrc(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Documento do orçamento (após criado) */}
      <OrcamentoView
        open={!!orcView}
        proposalId={orcView?.id ?? null}
        onOpenChange={(o) => !o && setOrcView(null)}
        onEdit={() => {
          const r = orcView;
          setOrcView(null);
          if (r) setOrc({ row: r, advance: false });
        }}
      />

      {/* Detalhe do card — grupos A–F (card do setter) */}
      <LeadDetalhe
        lead={detail?.leads ?? null}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />
    </div>
  );
}

// ---- Funil ------------------------------------------------------------------
function Funnel({
  counts,
  totais,
  className,
}: {
  counts: { count: (s: ProposalStage) => number };
  totais: number;
  className?: string;
}) {
  const { count } = counts;
  const conf = count("appointment_confirmed");
  const canc = count("appointment_canceled");
  const neg = count("negotiation");
  const nodeal = count("no_deal");
  const deal = count("deal");
  const max = Math.max(conf, neg, deal, 1);
  const bar = (v: number) => `${Math.max((v / max) * 100, 8)}%`;

  const FunnelRow = ({
    label,
    value,
    stage,
    sub,
  }: {
    label: string;
    value: number;
    stage: ProposalStage;
    sub?: string;
  }) => (
    <div>
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm font-medium text-foreground">{label}</span>
        <div className="flex flex-1 items-center gap-2">
          <div
            className="flex h-8 items-center justify-center rounded-lg text-sm font-semibold"
            style={{ width: bar(value), background: STAGE_COLOR[stage].bar, color: "#fff" }}
          >
            {value}
          </div>
          <span className="text-xs font-medium text-muted-foreground">{pct(value, totais)}</span>
        </div>
      </div>
      {sub && (
        <div className="ml-[108px] mt-1.5">
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {sub}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={`rounded-xl border bg-card p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ background: "#F0A81E", color: "#fff" }}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-base font-semibold text-foreground">Funil · visitas</h2>
      </div>
      <div className="space-y-3">
        <FunnelRow
          label="Confirmadas"
          value={conf}
          stage="appointment_confirmed"
          sub={`−${canc} canceladas`}
        />
        <FunnelRow label="Negociação" value={neg} stage="negotiation" sub={`−${nodeal} no deal`} />
        <FunnelRow label="Deal" value={deal} stage="deal" />
      </div>
    </div>
  );
}

// ---- Quadro de métrica ------------------------------------------------------
function MetricBox({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${success ? "text-emerald-600" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

// ---- Card do kanban ---------------------------------------------------------
function KanbanCard({
  row,
  onDragStart,
  onOrcamento,
  onDetail,
  onStageChange,
}: {
  row: Row;
  onDragStart: () => void;
  onOrcamento: () => void;
  onDetail: () => void;
  onStageChange: (next: ProposalStage) => void;
}) {
  const lead = row.leads;
  const nome = lead?.nome_cliente ?? "Sem nome";
  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const tel = lead?.telefone ?? "";
  const endereco = lead?.endereco ?? "Endereço a confirmar";
  const feito = orcamentoFeito(row);

  const IconLink = ({
    icon,
    label,
    onClick,
    href,
    accent,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    href?: string;
    accent?: boolean;
  }) => {
    const cls = `flex h-7 w-7 items-center justify-center rounded-md border ${
      accent
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border bg-background text-muted-foreground hover:text-foreground"
    }`;
    return href ? (
      <a
        href={href}
        aria-label={label}
        title={label}
        onClick={(e) => e.stopPropagation()}
        className={cls}
      >
        {icon}
      </a>
    ) : (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cls}
      >
        {icon}
      </button>
    );
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="cursor-grab rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">{nome}</p>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
          {initials}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" /> {visitLabel(row.visita_at)}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{endereco}</span>
        </p>
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <DollarSign className="h-3.5 w-3.5 shrink-0" /> {money(row.total_cliente)}
          {!feito && <span className="font-normal text-muted-foreground">(após orçamento)</span>}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <IconLink
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          label="GHL"
          href={
            row.ghl_opportunity_id
              ? `https://app.gohighlevel.com/v2/location/${row.location_id ?? GHL_DEFAULT_LOCATION_ID}/opportunities/list/${row.ghl_opportunity_id}?tab=OpportunityDetails`
              : undefined
          }
        />
        <IconLink icon={<CalendarIcon className="h-3.5 w-3.5" />} label="Google Calendar" />
        <IconLink
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Ligar"
          href={tel ? `tel:${tel}` : undefined}
        />
        <IconLink
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="SMS"
          href={tel ? `sms:${tel}` : undefined}
        />
        <IconLink
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          label="Orçamento / medição"
          onClick={onOrcamento}
          accent={!feito}
        />
        <button
          type="button"
          onClick={onDetail}
          className="ml-auto flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" /> Detalhes
        </button>
      </div>

      {/* Trocar de estágio no mobile (arrastar não funciona bem no toque) */}
      <div className="mt-2.5 md:hidden" onClick={(e) => e.stopPropagation()}>
        <Select value={row.stage} onValueChange={(v) => onStageChange(v as ProposalStage)}>
          <SelectTrigger
            className="h-9 w-full rounded-lg border-none text-xs font-semibold"
            style={{
              background: STAGE_COLOR[row.stage].head,
              color: STAGE_COLOR[row.stage].headText,
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: STAGE_COLOR[row.stage].bar }}
              />
              {STAGE_LABEL[row.stage]}
            </span>
          </SelectTrigger>
          <SelectContent>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: STAGE_COLOR[s].bar }}
                  />
                  {STAGE_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
