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

// Colors per stage — tones with good contrast (text always in the family's 900).
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

// Quote done = has a calculated value. It's the gate to move to Negotiation.
const orcamentoFeito = (r: Row) => r.total_cliente != null && r.total_cliente > 0;

function Overview() {
  const { user, isRuche } = useAuth();
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
      // visit: nearest first (nulls last)
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
    // Gate: only enters Negotiation with the quote (measurement) filled in.
    if (next === "negotiation" && !orcamentoFeito(row)) {
      toast.info("Fill in the quote (measurement) to move to Negotiation.");
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
        toast.error("Canceled on the site, but failed to notify GHL — please check manually.");
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

  const moverParaNeg = async (row: Row) => {
    setAskNeg(null);
    const { error } = await supabase
      .from("proposals")
      .update({ stage: "negotiation" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    await load();
    toast.success("Moved to Negotiation");
    // Measurement + quote ready → send the quote link to GHL (doesn't change stage there).
    if (row.ghl_opportunity_id) {
      try {
        await callGhlSync("push_quote_ready", row.id);
      } catch (e) {
        toast.error("Moved, but failed to send to GHL — please check manually.");
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Welcome, {user?.nome || user?.email}.{" "}
          {isRuche ? "You have full access." : "You are a partner."}
        </p>
      </div>

      {/* Filter bar — fixed at the top, bleeding to the edge */}
      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5 sm:-mx-6 sm:px-6">
        <div className="inline-flex shrink-0 rounded-lg border bg-card p-0.5">
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
            <CalendarDays className="h-4 w-4" /> Calendar
          </button>
        </div>

        <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
        <div className="flex min-w-[140px] flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Search client…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        {view === "kanban" && (
          <div className="flex min-w-[150px] flex-1 items-center gap-2 sm:flex-none">
            <ArrowDownAZ className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-9 flex-1 sm:w-52">
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Funnel counts={{ count }} totais={totais} className="lg:col-span-2" />
        <div className="space-y-3">
          <MetricBox label="Visits completed" value={pct(realizadas, totais)} />
          <MetricBox label="Deal / Negotiation" value={pct(deals, realizadas)} />
          <MetricBox label="Pipeline in negotiation" value={money(pipeline)} />
          <MetricBox label="Closed sale" value={money(vendaFechada)} success />
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
        // Mobile: carousel — swipe sideways to switch stage (one screen per stage).
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              className="flex w-[88%] shrink-0 snap-center flex-col rounded-xl border border-border/60 bg-muted/30 p-2"
            >
              <div
                className="mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: STAGE_COLOR[stage].head, color: STAGE_COLOR[stage].headText }}
              >
                <span>{STAGE_LABEL[stage]}</span>
                <span className="rounded-full bg-background/70 px-1.5">{count(stage)}</span>
              </div>
              <div className="flex h-[500px] flex-col gap-2 overflow-y-auto pr-1">
                {loading && <p className="p-2 text-xs text-muted-foreground">Loading…</p>}
                {!loading && byStage[stage].length === 0 && (
                  <p className="p-2 text-xs text-muted-foreground">No cards in this stage.</p>
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
                className="mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: STAGE_COLOR[stage].head, color: STAGE_COLOR[stage].headText }}
              >
                <span>Total</span>
                <span>{money(sumStage(stage))}</span>
              </div>
            </div>
          ))}
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
              <div className="flex h-[500px] flex-col gap-2 overflow-y-auto pr-1">
                {loading && <p className="p-2 text-xs text-muted-foreground">Loading…</p>}
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

      {/* Quote form (same as "New quote") */}
      <Dialog open={!!orc} onOpenChange={(o) => !o && setOrc(null)}>
        <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
            <DialogTitle>Quote · measurement</DialogTitle>
            <DialogDescription>
              Same form as "New quote". Filling it in unlocks the Negotiation stage.
            </DialogDescription>
          </DialogHeader>
          {orc && (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
            <DialogTitle>Move to Negotiation?</DialogTitle>
            <DialogDescription>
              The measurement for {askNeg?.leads?.nome_cliente ?? "this client"} has been saved. Do
              you want to move the card to the Negotiation stage now?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAskNeg(null)}>
              Not now
            </Button>
            <Button onClick={() => askNeg && moverParaNeg(askNeg)}>Move to Negotiation</Button>
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

// ---- Funnel -----------------------------------------------------------------
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
        <h2 className="text-base font-semibold text-foreground">Funnel · visits</h2>
      </div>
      <div className="space-y-3">
        <FunnelRow
          label="Confirmed"
          value={conf}
          stage="appointment_confirmed"
          sub={`−${canc} canceled`}
        />
        <FunnelRow label="Negotiation" value={neg} stage="negotiation" sub={`−${nodeal} no deal`} />
        <FunnelRow label="Deal" value={deal} stage="deal" />
      </div>
    </div>
  );
}

// ---- Metric box -------------------------------------------------------------
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

// ---- Kanban card ------------------------------------------------------------
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
      onClick={onDetail}
      role="button"
      className="cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
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
          {!feito && <span className="font-normal text-muted-foreground">(after quote)</span>}
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
          className="ml-auto flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold"
          style={
            feito
              ? { background: "#E7F4E4", color: "#2C7A3F" }
              : { background: "#FDECEC", color: "#B42318" }
          }
        >
          <ClipboardList className="h-3.5 w-3.5" /> {feito ? "Measured" : "Measure"}
        </button>
      </div>

      {/* Switch stage on mobile (dragging doesn't work well on touch) */}
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
