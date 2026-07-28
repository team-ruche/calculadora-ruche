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
} from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalStage,
  type LeadQualificacao,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { OrcamentoForm } from "@/components/OrcamentoForm";
import { DateRangePicker, presetRange } from "@/components/DateRangePicker";
import { PipelineCalendar, startOfWeek } from "@/components/PipelineCalendar";
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
  negotiation: { bar: "#D98416", text: "#3D2200", head: "#F5DDB4", headText: "#7A4405" },
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
  const [detail, setDetail] = useState<Row | null>(null);
  const [view, setView] = useState<ViewMode>("kanban");
  const [sortBy, setSortBy] = useState<SortBy>("visita");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));

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
    for (const r of visitRows) (m[r.stage] ?? m.appointment_confirmed).push(r);
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
  }, [visitRows, sortBy]);

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
  };

  const onOrcSaved = async () => {
    const current = orc;
    setOrc(null);
    await load();
    if (current?.advance && current.row.stage === "appointment_confirmed") {
      await supabase.from("proposals").update({ stage: "negotiation" }).eq("id", current.row.id);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Bem-vindo, {user?.nome || user?.email}.{" "}
            {isRuche ? "Você tem acesso total." : "Você é parceiro."}
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
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

        {view === "kanban" && (
          <div className="flex items-center gap-2">
            <ArrowDownAZ className="h-4 w-4 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-9 w-52">
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

      {view === "calendar" ? (
        <PipelineCalendar
          rows={rows}
          weekStart={weekStart}
          onWeekStart={setWeekStart}
          onSelect={(id) => {
            const r = rows.find((x) => x.id === id);
            if (r) setDetail(r);
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
                    onOrcamento={() => setOrc({ row, advance: false })}
                    onDetail={() => setDetail(row)}
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

      {/* Detalhe do card — grupos A–F */}
      <DetalheDialog row={detail} onOpenChange={(o) => !o && setDetail(null)} />
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
}: {
  row: Row;
  onDragStart: () => void;
  onOrcamento: () => void;
  onDetail: () => void;
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

      <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
        <IconLink icon={<ExternalLink className="h-3.5 w-3.5" />} label="GHL" />
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
    </div>
  );
}

// ---- Detalhe (grupos A–F, estilo do formulário) ----------------------------
function DetalheDialog({
  row,
  onOpenChange,
}: {
  row: Row | null;
  onOpenChange: (o: boolean) => void;
}) {
  const lead = row?.leads ?? null;
  const q = lead?.qualificacao ?? null;

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead?.nome_cliente ?? "Detalhes do lead"}</DialogTitle>
          <DialogDescription>
            Discovery do setter — grupos A a F (formulário GHL).
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <Section title="A · Contato">
              <Field label="Nome completo" value={q?.a_nome ?? lead?.nome_cliente} />
              <Field label="Telefone validado" value={q?.a_telefone ?? lead?.telefone} />
              <Field label="E-mail" value={q?.a_email ?? lead?.email} />
              <Field label="Endereço + ZIP" value={q?.a_endereco ?? lead?.endereco} />
              <Field label="Fonte do lead" value={q?.a_fonte} />
            </Section>

            <Section title="B · Elegibilidade">
              <Field label="É dono do imóvel?" value={yn(q?.b_dono)} />
              <Field label="ZIP na área do parceiro?" value={yn(q?.b_zip_area)} />
              <Field label="Tipo de imóvel" value={q?.b_tipo_imovel} />
              <Field label="Sqft estimado" value={q?.b_sqft_estimado} />
            </Section>

            <Section title="C · Motivação">
              <Field label="Por que trocar agora" value={q?.c_motivo} />
              <Field label="Parte de reforma maior?" value={yn(q?.c_reforma_maior)} />
              <Field label="Quem mora na casa" value={q?.c_quem_mora} />
              <Field label="Data-limite" value={q?.c_data_limite} />
            </Section>

            <Section title="D · Escopo">
              <Field label="Ambientes" value={(q?.d_ambientes ?? []).join(", ")} />
              <Field label="Sqft total" value={q?.d_sqft_total} />
              <Field label="Piso atual" value={q?.d_piso_atual} />
              <Field label="Piso desejado" value={q?.d_piso_desejado} />
              <Field label="Material comprado" value={q?.d_material_comprado} />
              <Field label="Cor / estilo" value={q?.d_cor_estilo} />
              <Field label="Serviço" value={q?.d_servico} />
            </Section>

            <Section title="E · Dinheiro e concorrência">
              <Field label="Faixa de budget" value={q?.e_budget} />
              <Field label="Forma de pagamento" value={q?.e_pagamento} />
              <Field label="Outros orçamentos" value={q?.e_outros_orcamentos} />
            </Section>

            <Section title="F · Decisão e agendamento">
              <Field label="Decisores" value={q?.f_decisores} />
              <Field label="Decisores confirmados" value={yn(q?.f_decisores_confirmados)} />
              <Field
                label="Temperatura do lead"
                value={q?.f_temperatura ? `${q.f_temperatura}/5` : undefined}
              />
              <Field label="Observações" value={q?.f_observacoes} full />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const yn = (v: boolean | undefined) => (v === undefined ? undefined : v ? "Sim" : "Não");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string | number | null | undefined;
  full?: boolean;
}) {
  const shown = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm text-foreground">
        {shown}
      </div>
    </div>
  );
}
