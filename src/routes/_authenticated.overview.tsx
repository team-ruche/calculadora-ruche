import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  MessageSquare,
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarCheck,
  Target,
  TrendingUp,
  Trophy,
  LayoutGrid,
  ExternalLink,
  ClipboardList,
  MapPin,
  DollarSign,
  ArrowDownAZ,
  Search,
  Plus,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  supabase,
  callGhlSync,
  type Proposal,
  type ProposalStage,
  type LeadQualificacao,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/integrations/supabase/models";
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
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { STAGE_STYLE } from "@/lib/proposal-stage";
import { filterPipelineRows, type VisitScope } from "@/lib/pipeline";

// Fallback for when the proposal does not yet have a location_id stored (leads
// created before step 10). Today only 1 client is running the sync.
const GHL_DEFAULT_LOCATION_ID = "jl5iFelWb5hiWu9FIeiD";

type ViewMode = "kanban" | "calendar";
type SortBy = "visita" | "alpha" | "created";
const SORT_LABEL: Record<SortBy, string> = {
  visita: "Visit date",
  alpha: "Alphabetical",
  created: "Creation date",
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
  if (!iso) return "Visit to be scheduled";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const REALIZADAS: ProposalStage[] = ["pricing_review", "negotiation", "no_deal", "deal"];

// Quote done = has a calculated value. It's the gate to move to Negotiation.
const orcamentoFeito = (r: Row) => r.total_cliente != null && r.total_cliente > 0;

function Overview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(() => presetRange("90d"));
  // Quote form (= measurement form). advance moves to negotiation on save.
  const [orc, setOrc] = useState<{ row: Row; advance: boolean } | null>(null);
  const [orcView, setOrcView] = useState<Row | null>(null);
  const [askNeg, setAskNeg] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [sortBy, setSortBy] = useState<SortBy>("visita");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [busca, setBusca] = useState("");
  const [visitScope, setVisitScope] = useState<VisitScope>("all");
  const [mobileStage, setMobileStage] = useState<ProposalStage>("appointment_confirmed");
  const [dropStage, setDropStage] = useState<ProposalStage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [calendarRange, setCalendarRange] = useState<Range>(() => {
    const from = startOfWeek(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  });
  const isMobile = useIsMobile();

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

  const filteredRows = useMemo(
    () =>
      filterPipelineRows(rows, {
        range: view === "calendar" ? calendarRange : range,
        query: busca,
        visitScope: view === "calendar" ? "scheduled" : visitScope,
      }),
    [rows, range, calendarRange, busca, view, visitScope],
  );

  const byStage = useMemo(() => {
    const m: Record<ProposalStage, Row[]> = {
      appointment_confirmed: [],
      appointment_canceled: [],
      pricing_review: [],
      negotiation: [],
      no_deal: [],
      deal: [],
    };
    for (const r of filteredRows) {
      (m[r.stage] ?? m.appointment_confirmed).push(r);
    }
    const cmp = (a: Row, b: Row) => {
      if (sortBy === "alpha")
        return (a.leads?.nome_cliente ?? "").localeCompare(b.leads?.nome_cliente ?? "");
      if (sortBy === "created")
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      // visit: nearest first (nulls last)
      const ta = a.visita_at ? new Date(a.visita_at).getTime() : Infinity;
      const tb = b.visita_at ? new Date(b.visita_at).getTime() : Infinity;
      return ta - tb;
    };
    for (const s of STAGE_ORDER) m[s].sort(cmp);
    return m;
  }, [filteredRows, sortBy]);

  const count = (s: ProposalStage) => byStage[s].length;
  const sumStage = (s: ProposalStage) => byStage[s].reduce((a, r) => a + (r.total_cliente ?? 0), 0);

  const totais = filteredRows.length;
  const scheduled = filteredRows.filter((r) => r.visita_at);
  const completed = scheduled.filter((r) => REALIZADAS.includes(r.stage));
  const deals = completed.filter((r) => r.stage === "deal").length;
  const pipeline = filteredRows
    .filter((r) => r.stage === "negotiation")
    .reduce((a, r) => a + (r.total_cliente ?? 0), 0);
  const vendaFechada = filteredRows
    .filter((r) => r.stage === "deal")
    .reduce((a, r) => a + (r.total_cliente ?? 0), 0);

  const changeStage = async (row: Row, next: ProposalStage) => {
    if (row.stage === next) return;
    // Gate: pricing approval and negotiation both need the quote priced.
    if ((next === "pricing_review" || next === "negotiation") && !orcamentoFeito(row)) {
      toast.info("Fill in the quote (measurement) first.");
      setOrc({ row, advance: true });
      return;
    }
    const { error } = await supabase.from("proposals").update({ stage: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();

    // A cancellation made on the site needs to mirror to GHL — Confirmed/Canceled
    // is a stage that GHL also owns, so it has to know. Deal/No Deal
    // remain only as targets of the sync coming from GHL (the closer decides there).
    if (next === "appointment_canceled" && row.ghl_opportunity_id) {
      try {
        await callGhlSync("cancel_appointment", row.id);
      } catch (e) {
        toast.error(
          `Canceled on the site, but GHL was not notified: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  };

  const onOrcSaved = async () => {
    const current = orc;
    setOrc(null);
    await load();
    // When approving/saving the measurement, ask whether to move to Negotiation.
    if (current && current.row.stage === "appointment_confirmed") {
      setAskNeg(current.row);
    }
  };

  // A medicao salva nao vai mais direto para negociacao: passa pelo closer,
  // que ajusta e aprova o pricing. A aprovacao e que move para Negotiation.
  const moverParaPricing = async (row: Row) => {
    setAskNeg(null);
    const { error } = await supabase
      .from("proposals")
      .update({ stage: "pricing_review" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await load();
    toast.success("Sent for pricing approval");
    // Measurement + quote ready → send the quote link to GHL (doesn't change stage there).
    if (row.ghl_opportunity_id) {
      try {
        await callGhlSync("push_quote_ready", row.id);
      } catch (e) {
        toast.error(`Moved, but not sent to GHL: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  // When clicking the quote: if already created, open the document; otherwise, open the form.
  const abrirOrcamento = (row: Row) => {
    if (orcamentoFeito(row)) setOrcView(row);
    else setOrc({ row, advance: false });
  };

  return (
    <div className="space-y-6">
      <section
        className="overview-hero space-y-6 rounded-[1.75rem] p-5 sm:p-7"
        aria-label="Pipeline overview"
      >
        <PageHeader
          title="Overview"
          description="Your visits, quotes and opportunities in one place."
          actions={
            <>
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh pipeline"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New quote
              </Button>
            </>
          }
        />

        <div className="metric-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={CalendarCheck}
            label="Visits completed"
            value={pct(completed.length, scheduled.length)}
            sub={`${completed.length} of ${scheduled.length} scheduled visits`}
            loading={loading}
          />
          <MetricCard
            icon={Target}
            label="Visit win rate"
            value={pct(deals, completed.length)}
            sub="Deals / completed visits"
            loading={loading}
          />
          <MetricCard
            icon={TrendingUp}
            label="In negotiation"
            value={money(pipeline)}
            sub="Opportunities in this view"
            loading={loading}
          />
          <MetricCard
            icon={Trophy}
            label="Won value"
            value={money(vendaFechada)}
            sub="Won opportunities in this view"
            tone="success"
            loading={loading}
          />
        </div>
      </section>

      <div className="glass-toolbar floating-toolbar sticky top-20 z-30 space-y-3 rounded-2xl px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex shrink-0 rounded-xl border border-border/60 bg-card/70 p-1"
            role="group"
            aria-label="Pipeline view"
          >
            <button
              type="button"
              aria-pressed={view === "kanban"}
              onClick={() => setView("kanban")}
              className={`ruche-button flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              type="button"
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
              className={`ruche-button flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <CalendarDays className="h-4 w-4" />
              Calendar
            </button>
          </div>
          {view === "kanban" && (
            <>
              {visitScope !== "unscheduled" && (
                <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
              )}
              <Select value={visitScope} onValueChange={(v) => setVisitScope(v as VisitScope)}>
                <SelectTrigger className="h-10 w-44" aria-label="Visit status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All opportunities</SelectItem>
                  <SelectItem value="scheduled">Scheduled visits</SelectItem>
                  <SelectItem value="unscheduled">Unscheduled</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <label className="form-field flex min-w-40 flex-1 items-center gap-2 rounded-xl border px-3 py-2 focus-within:ring-2 focus-within:ring-brand-ink">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              aria-label="Search clients"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Search client…"
              className="min-w-0 w-full bg-transparent text-sm outline-none"
            />
          </label>
          {view === "kanban" && (
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-10 w-40" aria-label="Sort opportunities">
                <ArrowDownAZ className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortBy[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SORT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {loading ? "Loading opportunities…" : `${totais} opportunities`} ·{" "}
          {view === "calendar"
            ? "Metrics follow the visible calendar dates."
            : visitScope === "unscheduled"
              ? "Unscheduled opportunities across all dates."
              : `Filtered by visit date${visitScope === "all" ? "; unscheduled opportunities included across all dates" : ""}.`}{" "}
          {busca.trim() && "Search applies to cards and metrics."}
        </p>
      </div>

      {view === "calendar" ? (
        <PipelineCalendar
          rows={rows.filter((r) =>
            (r.leads?.nome_cliente ?? "").toLowerCase().includes(busca.trim().toLowerCase()),
          )}
          weekStart={weekStart}
          onWeekStart={setWeekStart}
          onVisibleRangeChange={setCalendarRange}
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
      ) : (
        <div className="space-y-3">
          {isMobile && (
            <Select value={mobileStage} onValueChange={(v) => setMobileStage(v as ProposalStage)}>
              <SelectTrigger className="h-11 w-full" aria-label="Pipeline stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABEL[s]} ({count(s)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-3 overflow-x-auto pb-3" aria-label="Opportunity pipeline">
            {(isMobile ? [mobileStage] : STAGE_ORDER).map((stage) => {
              const outcome = stage === "appointment_canceled" || stage === "no_deal";
              return (
                <section
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropStage(stage);
                  }}
                  onDragLeave={() => setDropStage(null)}
                  onDrop={() => {
                    const row = rows.find((r) => r.id === dragId);
                    setDragId(null);
                    setDropStage(null);
                    if (row) changeStage(row, stage);
                  }}
                  className={`pipeline-column flex min-w-0 shrink-0 flex-col rounded-2xl border p-2 ${isMobile ? "w-full" : "w-[280px]"} ${dropStage === stage ? "pipeline-column-drop" : outcome ? "pipeline-column-outcome" : ""}`}
                >
                  <div className="flex items-center gap-2 px-2 py-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: STAGE_STYLE[stage].dot }}
                      aria-hidden
                    />
                    <h2 className="flex-1 text-sm font-semibold">{STAGE_LABEL[stage]}</h2>
                    <span className="rounded-md bg-card px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {count(stage)}
                    </span>
                  </div>
                  <div
                    className="flex min-h-48 flex-col gap-3 overflow-y-auto px-0.5 pb-3 md:h-[clamp(18rem,calc(100dvh-25rem),48rem)]"
                    aria-busy={loading}
                  >
                    {loading ? (
                      <>
                        <div className="h-36 animate-pulse rounded-xl bg-card" />
                        <div className="h-36 animate-pulse rounded-xl bg-card" />
                      </>
                    ) : byStage[stage].length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {busca ? "No matching opportunities." : "No opportunities in this stage."}
                      </p>
                    ) : (
                      byStage[stage].map((row) => (
                        <KanbanCard
                          key={row.id}
                          row={row}
                          onDragStart={() => setDragId(row.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDropStage(null);
                          }}
                          onOrcamento={() => abrirOrcamento(row)}
                          onDetail={() => setDetail(row)}
                          onStageChange={(next) => changeStage(row, next)}
                        />
                      ))
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t px-2 pt-3 pb-1 text-xs text-muted-foreground">
                    <span>Quoted value</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {money(sumStage(stage))}
                    </span>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <details className="glass-panel group rounded-2xl p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
          Pipeline by stage
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Current stage distribution for the same filters. Not historical conversion.
        </p>
        <StageDistribution count={count} total={totais} />
      </details>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>New quote</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <OrcamentoForm
              mode="create"
              onSaved={() => {
                setCreateOpen(false);
                load();
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Quote form (same as "New quote") */}
      <Dialog open={!!orc} onOpenChange={(o) => !o && setOrc(null)}>
        <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Quote · measurement</DialogTitle>
            <DialogDescription>
              Record the project measurements, then send the quote for pricing approval.
            </DialogDescription>
          </DialogHeader>
          {orc && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <OrcamentoForm
                mode="edit"
                proposalId={orc.row.id}
                onSaved={onOrcSaved}
                onCancel={() => setOrc(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Ask whether to move to Negotiation after approving the measurement */}
      <Dialog open={!!askNeg} onOpenChange={(o) => !o && setAskNeg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send for pricing approval?</DialogTitle>
            <DialogDescription>
              The measurement for {askNeg?.leads?.nome_cliente ?? "this client"} has been saved. Do
              you want to send it for pricing approval now?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAskNeg(null)}>
              Not now
            </Button>
            <Button onClick={() => askNeg && moverParaPricing(askNeg)}>Send for approval</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quote document (after creation) */}
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

      {/* Card detail — groups A–F (setter card) */}
      <LeadDetalhe
        lead={detail?.leads ?? null}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />
    </div>
  );
}

function StageDistribution({
  count,
  total,
}: {
  count: (stage: ProposalStage) => number;
  total: number;
}) {
  const max = Math.max(...STAGE_ORDER.map(count), 1);
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {STAGE_ORDER.map((stage) => {
        const value = count(stage);
        return (
          <div key={stage}>
            <div className="mb-1.5 flex justify-between gap-2 text-xs">
              <span>{STAGE_LABEL[stage]}</span>
              <span className="tabular-nums">
                {value} · {pct(value, total)}
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${STAGE_LABEL[stage]}: ${value}, ${pct(value, total)} of opportunities`}
            >
              <div
                className="stage-bar h-full rounded-full"
                style={{ width: `${(value / max) * 100}%`, background: STAGE_STYLE[stage].dot }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Kanban card ------------------------------------------------------------
function KanbanCard({
  row,
  onDragStart,
  onDragEnd,
  onOrcamento,
  onDetail,
  onStageChange,
}: {
  row: Row;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOrcamento: () => void;
  onDetail: () => void;
  onStageChange: (next: ProposalStage) => void;
}) {
  const lead = row.leads;
  const nome = lead?.nome_cliente ?? "No name";
  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const tel = lead?.telefone ?? "";
  const endereco = lead?.endereco ?? "Address to be confirmed";
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
    const cls = `flex h-9 w-9 items-center justify-center rounded-md border ${
      accent
        ? "border-primary/40 bg-primary/10 text-brand-ink"
        : "border-border bg-background text-muted-foreground hover:text-foreground"
    }`;
    return href ? (
      <a
        href={href}
        data-touch-action
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
        data-touch-action
        aria-label={label}
        title={label}
        disabled={!onClick}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={`${cls} disabled:cursor-not-allowed disabled:opacity-35`}
      >
        {icon}
      </button>
    );
  };

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="pipeline-card rounded-2xl p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onDetail}
          className="text-left text-sm font-semibold leading-snug text-foreground hover:underline"
        >
          {nome}
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-brand-ink">
          {initials}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />{" "}
          <span className="font-medium text-foreground">{visitLabel(row.visita_at)}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{endereco}</span>
        </p>
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <DollarSign className="h-3.5 w-3.5 shrink-0" />{" "}
          {feito ? money(row.total_cliente) : "Not quoted"}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
        <IconLink
          icon={<Phone className="h-3.5 w-3.5" />}
          label="Call"
          href={tel ? `tel:${tel}` : undefined}
        />
        <IconLink
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="SMS"
          href={tel ? `sms:${tel}` : undefined}
        />
        <IconLink
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          label="GHL"
          href={
            row.ghl_opportunity_id
              ? `https://app.gohighlevel.com/v2/location/${row.location_id ?? GHL_DEFAULT_LOCATION_ID}/opportunities/list/${row.ghl_opportunity_id}?tab=OpportunityDetails`
              : undefined
          }
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOrcamento();
          }}
          className="ml-auto flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold"
          style={
            feito
              ? { background: "#E7F4E4", color: "#2C7A3F" }
              : { background: "#FBE7BF", color: "#7A4E05" }
          }
        >
          <ClipboardList className="h-3.5 w-3.5" /> {feito ? "View quote" : "Measure"}
        </button>
      </div>

      {/* Switch stage on mobile (dragging doesn't work well on touch) */}
      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
        <Select value={row.stage} onValueChange={(v) => onStageChange(v as ProposalStage)}>
          <SelectTrigger
            aria-label={`Move ${nome} to stage`}
            className="h-9 w-full rounded-lg border-none text-xs font-medium"
            style={{
              background: STAGE_STYLE[row.stage].bg,
              color: STAGE_STYLE[row.stage].fg,
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: STAGE_STYLE[row.stage].dot }}
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
                    style={{ background: STAGE_STYLE[s].dot }}
                  />
                  {STAGE_LABEL[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </article>
  );
}
