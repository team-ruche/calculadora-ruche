import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { ProposalStage } from "@/integrations/supabase/client";
import { STAGE_LABEL } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type CalRow = {
  id: string;
  visita_at: string | null;
  stage: ProposalStage;
  total_cliente: number | null;
  leads: { nome_cliente: string | null } | null;
};

const STAGE_BG: Record<ProposalStage, { bg: string; fg: string; border: string }> = {
  appointment_confirmed: { bg: "#FBE7BF", fg: "#7A4E05", border: "#F0A81E" },
  appointment_canceled: { bg: "#F6D6C7", fg: "#7A2E12", border: "#E07A52" },
  negotiation: { bg: "#F5DDB4", fg: "#7A4405", border: "#D98416" },
  no_deal: { bg: "#DEDCD2", fg: "#45443D", border: "#9C9A90" },
  deal: { bg: "#D3E8BC", fg: "#2C5212", border: "#5FA13B" },
};

const START_HOUR = 6; // 6h
const END_HOUR = 22; // 22h
const ROW_H = 52; // px por hora

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // domingo
  return x;
}

const hourLabel = (h: number) => {
  const am = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${am}`;
};

interface Props {
  rows: CalRow[];
  weekStart: Date;
  onWeekStart: (d: Date) => void;
  onSelect: (id: string) => void;
}

export function PipelineCalendar({ rows, weekStart, onWeekStart, onSelect }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const move = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    onWeekStart(d);
  };

  const eventsFor = (day: Date) =>
    rows.filter((r) => r.visita_at && isSameDay(new Date(r.visita_at), day));

  return (
    <div className="rounded-xl border bg-card">
      {/* Toolbar do calendário */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button variant="outline" size="sm" onClick={() => onWeekStart(startOfWeek(new Date()))}>
          Hoje
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-40 text-center text-sm font-semibold">
            {format(days[0], "d MMM")} – {format(days[6], "d MMM yyyy")}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b">
            <div className="border-r" />
            {days.map((d) => {
              const hoje = isSameDay(d, today);
              return (
                <div
                  key={d.toISOString()}
                  className={`border-r px-2 py-2 text-center text-sm ${
                    hoje ? "font-bold text-primary" : "font-medium text-muted-foreground"
                  }`}
                >
                  {format(d, "dd")} {format(d, "EEE")}
                </div>
              );
            })}
          </div>

          {/* Grade de horas */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)]">
            {/* coluna das horas */}
            <div className="border-r">
              {hours.map((h) => (
                <div key={h} className="relative border-b text-right" style={{ height: ROW_H }}>
                  <span className="absolute -top-2 right-1 text-[11px] text-muted-foreground">
                    {hourLabel(h)}
                  </span>
                </div>
              ))}
            </div>

            {/* colunas dos dias */}
            {days.map((day) => (
              <div key={day.toISOString()} className="relative border-r">
                {hours.map((h) => (
                  <div key={h} className="border-b" style={{ height: ROW_H }} />
                ))}
                {eventsFor(day).map((r) => {
                  const dt = new Date(r.visita_at as string);
                  const minutes = (dt.getHours() - START_HOUR) * 60 + dt.getMinutes();
                  const top = (minutes / 60) * ROW_H;
                  if (dt.getHours() < START_HOUR || dt.getHours() > END_HOUR) return null;
                  const c = STAGE_BG[r.stage];
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelect(r.id)}
                      className="absolute left-1 right-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left"
                      style={{
                        top: Math.max(top, 0),
                        minHeight: 40,
                        background: c.bg,
                        color: c.fg,
                        borderColor: c.border,
                      }}
                      title={`${r.leads?.nome_cliente ?? ""} · ${STAGE_LABEL[r.stage]}`}
                    >
                      <span className="block truncate text-xs font-semibold">
                        {format(dt, "HH:mm")} {r.leads?.nome_cliente ?? "Lead"}
                      </span>
                      <span className="block truncate text-[11px] opacity-80">
                        {r.total_cliente ? money(r.total_cliente) : STAGE_LABEL[r.stage]}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
