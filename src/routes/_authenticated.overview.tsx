import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  MessageSquare,
  Calendar as CalendarIcon,
  ExternalLink,
  Ruler,
  MapPin,
  DollarSign,
  ChevronDown,
  ChevronUp,
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
import { MedicaoForm } from "@/components/MedicaoForm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

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

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const pct = (num: number, den: number) => (den === 0 ? "0%" : `${Math.round((num / den) * 100)}%`);

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

// Cores por estágio (alinhadas ao mockup)
const STAGE_COLOR: Record<ProposalStage, { bg: string; fg: string }> = {
  appointment_confirmed: { bg: "#FAC775", fg: "#633806" },
  appointment_canceled: { bg: "#F5C4B3", fg: "#712B13" },
  negotiation: { bg: "#EF9F27", fg: "#412402" },
  no_deal: { bg: "#D3D1C7", fg: "#2C2C2A" },
  deal: { bg: "#97C459", fg: "#173404" },
};

// ---- filtro de período (por quadro) ----------------------------------------
type Period = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "90d";
const PERIOD_LABEL: Record<Period, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Este mês",
  mes_passado: "Mês passado",
  "90d": "Últimos 90 dias",
};

function periodRange(p: Period): [Date, Date] {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (p) {
    case "hoje":
      return [start, end];
    case "7d":
      start.setDate(start.getDate() - 6);
      return [start, end];
    case "30d":
      start.setDate(start.getDate() - 29);
      return [start, end];
    case "90d":
      start.setDate(start.getDate() - 89);
      return [start, end];
    case "mes":
      return [new Date(now.getFullYear(), now.getMonth(), 1), end];
    case "mes_passado":
      return [
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      ];
  }
}

const inPeriod = (iso: string | null, p: Period) => {
  if (!iso) return false;
  const [a, b] = periodRange(p);
  const t = new Date(iso).getTime();
  return t >= a.getTime() && t <= b.getTime();
};

function Overview() {
  const { user, isRuche } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [medProposal, setMedProposal] = useState<Row | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

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

  const byStage = useMemo(() => {
    const m: Record<ProposalStage, Row[]> = {
      appointment_confirmed: [],
      appointment_canceled: [],
      negotiation: [],
      no_deal: [],
      deal: [],
    };
    for (const r of rows) (m[r.stage] ?? m.appointment_confirmed).push(r);
    return m;
  }, [rows]);

  const count = (s: ProposalStage) => byStage[s].length;

  const changeStage = async (row: Row, next: ProposalStage) => {
    if (row.stage === next) return;
    // Gate: só entra em negociação com a medição preenchida.
    if (next === "negotiation" && !row.medicao_preenchida) {
      setMedProposal(row);
      return;
    }
    const { error } = await supabase.from("proposals").update({ stage: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo, {user?.nome || user?.email}.{" "}
          {isRuche ? "Você tem acesso total." : "Você é parceiro."}
        </p>
      </div>

      {/* Funil + quadros */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Funnel counts={{ count }} className="lg:col-span-2" />
        <div className="space-y-3">
          <MetricBox
            label="Visitas realizadas"
            compute={(p) => {
              const totais = rows.filter((r) => inPeriod(r.visita_at, p)).length;
              const realizadas = rows.filter(
                (r) =>
                  inPeriod(r.visita_at, p) && ["negotiation", "no_deal", "deal"].includes(r.stage),
              ).length;
              return pct(realizadas, totais);
            }}
          />
          <MetricBox
            label="Deal / Negociação"
            compute={(p) => {
              const negs = rows.filter(
                (r) =>
                  inPeriod(r.visita_at, p) && ["negotiation", "no_deal", "deal"].includes(r.stage),
              ).length;
              const deals = rows.filter(
                (r) => inPeriod(r.visita_at, p) && r.stage === "deal",
              ).length;
              return pct(deals, negs);
            }}
          />
          <MetricBox
            label="Pipeline em negociação"
            defaultPeriod="90d"
            compute={() =>
              money(
                rows
                  .filter((r) => r.stage === "negotiation")
                  .reduce((a, r) => a + (r.total_cliente ?? 0), 0),
              )
            }
          />
          <MetricBox
            label="Venda fechada"
            success
            compute={(p) =>
              money(
                rows
                  .filter((r) => r.stage === "deal" && inPeriod(r.fechado_at, p))
                  .reduce((a, r) => a + (r.total_cliente ?? 0), 0),
              )
            }
          />
        </div>
      </div>

      {/* Kanban */}
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
            className="flex flex-col rounded-xl bg-muted/40 p-2"
          >
            <div
              className="mb-2 flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium"
              style={{ background: STAGE_COLOR[stage].bg, color: STAGE_COLOR[stage].fg }}
            >
              <span>{STAGE_LABEL[stage]}</span>
              <span>{count(stage)}</span>
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
                  onMedicao={() => setMedProposal(row)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <MedicaoForm
        open={!!medProposal}
        proposalId={medProposal?.id ?? null}
        initial={medProposal?.medicao ?? null}
        advanceToStage={
          medProposal && medProposal.stage === "appointment_confirmed" ? "negotiation" : undefined
        }
        onOpenChange={(o) => !o && setMedProposal(null)}
        onSaved={load}
      />
    </div>
  );
}

// ---- Funil ------------------------------------------------------------------
function Funnel({
  counts,
  className,
}: {
  counts: { count: (s: ProposalStage) => number };
  className?: string;
}) {
  const { count } = counts;
  const conf = count("appointment_confirmed");
  const canc = count("appointment_canceled");
  const neg = count("negotiation");
  const nodeal = count("no_deal");
  const deal = count("deal");
  const max = Math.max(conf, neg, deal, 1);
  const bar = (v: number) => `${Math.max((v / max) * 100, 6)}%`;

  const FunnelRow = ({
    label,
    value,
    color,
    fg,
    sub,
  }: {
    label: string;
    value: number;
    color: string;
    fg: string;
    sub?: string;
  }) => (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
        <div
          className="flex h-6 items-center justify-center rounded-md text-xs font-medium"
          style={{ width: bar(value), background: color, color: fg }}
        >
          {value}
        </div>
      </div>
      {sub && (
        <div className="ml-[104px] mt-1">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {sub}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={`rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <p className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Funil · visitas</p>
      <div className="space-y-2.5">
        <FunnelRow
          label="Confirmadas"
          value={conf}
          color={STAGE_COLOR.appointment_confirmed.bg}
          fg={STAGE_COLOR.appointment_confirmed.fg}
          sub={`−${canc} canceladas`}
        />
        <FunnelRow
          label="Negociação"
          value={neg}
          color={STAGE_COLOR.negotiation.bg}
          fg={STAGE_COLOR.negotiation.fg}
          sub={`−${nodeal} no deal`}
        />
        <FunnelRow label="Deal" value={deal} color={STAGE_COLOR.deal.bg} fg={STAGE_COLOR.deal.fg} />
      </div>
    </div>
  );
}

// ---- Quadro de métrica com filtro de período -------------------------------
function MetricBox({
  label,
  compute,
  defaultPeriod = "mes",
  success,
}: {
  label: string;
  compute: (p: Period) => string;
  defaultPeriod?: Period;
  success?: boolean;
}) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-1 text-[11px] text-primary shadow-none">
            <CalendarIcon className="h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                {PERIOD_LABEL[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className={`mt-1 text-lg font-semibold ${success ? "text-emerald-600" : ""}`}>
        {compute(period)}
      </p>
    </div>
  );
}

// ---- Card do kanban ---------------------------------------------------------
function KanbanCard({
  row,
  onDragStart,
  onMedicao,
}: {
  row: Row;
  onDragStart: () => void;
  onMedicao: () => void;
}) {
  const [open, setOpen] = useState(false);
  const lead = row.leads;
  const q = lead?.qualificacao ?? null;
  const nome = lead?.nome_cliente ?? "Sem nome";
  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  const tel = lead?.telefone ?? "";
  const endereco = lead?.endereco ?? "Endereço a confirmar";

  const iconBtn = (child: React.ReactNode, label: string, onClick?: () => void, href?: string) =>
    href ? (
      <a
        href={href}
        aria-label={label}
        title={label}
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground"
      >
        {child}
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
        className="text-muted-foreground hover:text-foreground"
      >
        {child}
      </button>
    );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="cursor-grab rounded-xl border bg-card p-3 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{nome}</p>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
          {initials}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5" /> {visitLabel(row.visita_at)}
        </p>
        <p className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> <span className="truncate">{endereco}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <DollarSign className="h-3.5 w-3.5" /> {money(row.total_cliente)}
          {!row.total_cliente && <span className="text-[10px]">(após orçamento)</span>}
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-3 border-t pt-2 text-[15px]">
        {iconBtn(<ExternalLink className="h-4 w-4" />, "GHL")}
        {iconBtn(<CalendarIcon className="h-4 w-4" />, "Google Calendar")}
        {iconBtn(<Phone className="h-4 w-4" />, "Ligar", undefined, tel ? `tel:${tel}` : undefined)}
        {iconBtn(
          <MessageSquare className="h-4 w-4" />,
          "SMS",
          undefined,
          tel ? `sms:${tel}` : undefined,
        )}
        {iconBtn(
          <Ruler className={`h-4 w-4 ${row.medicao_preenchida ? "" : "text-primary"}`} />,
          "Formulário de medição",
          onMedicao,
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label={open ? "Fechar detalhes" : "Ver detalhes"}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Group title="A · Contato">
            {q?.a_email ?? lead?.email ?? "—"} · {q?.a_telefone ?? (tel || "—")} ·{" "}
            {q?.a_fonte ?? "fonte —"}
          </Group>
          <Group title="B · Elegibilidade">
            Dono: {yn(q?.b_dono)} · Tipo: {q?.b_tipo_imovel ?? "—"} · Sqft est.:{" "}
            {q?.b_sqft_estimado ?? "—"}
          </Group>
          <Group title="C · Motivação">
            {q?.c_motivo ?? "—"}
            {q?.c_data_limite ? ` · até ${q.c_data_limite}` : ""}
          </Group>
          <Group title="D · Escopo">
            {(q?.d_ambientes ?? []).join(", ") || "ambientes —"} · {q?.d_sqft_total ?? "—"} sqft ·{" "}
            {q?.d_piso_atual ?? "—"} → {q?.d_piso_desejado ?? "—"} · {q?.d_servico ?? "—"}
          </Group>
          <Group title="E · Dinheiro e concorrência">
            Budget: {q?.e_budget ?? "—"} · Pagamento: {q?.e_pagamento ?? "—"} · Outros:{" "}
            {q?.e_outros_orcamentos ?? "—"}
          </Group>
        </div>
      )}
    </div>
  );
}

const yn = (v: boolean | undefined) => (v === undefined ? "—" : v ? "sim" : "não");

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-primary">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
