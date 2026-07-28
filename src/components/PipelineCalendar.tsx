import { ChevronLeft, ChevronRight, Eye, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProposalStage } from "@/integrations/supabase/client";
import { STAGE_LABEL, STAGE_ORDER } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CalRow = {
  id: string;
  visita_at: string | null;
  stage: ProposalStage;
  total_cliente: number | null;
  leads: { nome_cliente: string | null } | null;
};

const STAGE_BG: Record<ProposalStage, { bg: string; fg: string; border: string; dot: string }> = {
  appointment_confirmed: { bg: "#FCEED2", fg: "#5C3B04", border: "#F0A81E", dot: "#F0A81E" },
  appointment_canceled: { bg: "#F9E1D7", fg: "#5C2410", border: "#E07A52", dot: "#E07A52" },
  negotiation: { bg: "#F9E7C6", fg: "#5C3304", border: "#D98416", dot: "#D98416" },
  no_deal: { bg: "#E6E4DB", fg: "#3A3934", border: "#9C9A90", dot: "#9C9A90" },
  deal: { bg: "#DFEECB", fg: "#204009", border: "#5FA13B", dot: "#5FA13B" },
};

const START_HOUR = 7;
const END_HOUR = 21;
const ROW_H = 60;

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
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
  onChangeStage: (id: string, next: ProposalStage) => void;
}

export function PipelineCalendar({ rows, weekStart, onWeekStart, onSelect, onChangeStage }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const move = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    onWeekStart(d);
  };

  const eventsFor = (day: Date) =>
    rows.filter((r) => r.visita_at && isSameDay(new Date(r.visita_at), day));

  const nowTop =
    now.getHours() >= START_HOUR && now.getHours() <= END_HOUR
      ? ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (ROW_H / 60)
      : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => onWeekStart(startOfWeek(new Date()))}>
          Hoje
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-semibold">
            {format(days[0], "d MMM", { locale: ptBR })} –{" "}
            {format(days[6], "d MMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          {STAGE_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: STAGE_BG[s].dot }}
                aria-hidden
              />
              {STAGE_LABEL[s]}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[840px]">
          {/* Cabeçalho dos dias */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/20">
            <div />
            {days.map((d) => {
              const hoje = isSameDay(d, now);
              return (
                <div
                  key={d.toISOString()}
                  className={`px-2 py-2.5 text-center ${hoje ? "bg-primary/5" : ""}`}
                >
                  <div
                    className={`text-lg font-bold leading-none ${
                      hoje ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {format(d, "dd")}
                  </div>
                  <div
                    className={`text-[11px] uppercase ${
                      hoje ? "font-semibold text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {format(d, "EEE", { locale: ptBR })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grade */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)]">
            {/* Gutter de horas */}
            <div>
              {hours.map((h) => (
                <div
                  key={h}
                  className="relative border-t border-border/50"
                  style={{ height: ROW_H }}
                >
                  <span className="absolute right-2 top-0 -translate-y-1/2 bg-card px-1 text-[11px] text-muted-foreground">
                    {hourLabel(h)}
                  </span>
                </div>
              ))}
            </div>

            {/* Colunas dos dias */}
            {days.map((day) => {
              const hoje = isSameDay(day, now);
              return (
                <div
                  key={day.toISOString()}
                  className={`relative border-l border-border/50 ${hoje ? "bg-primary/5" : ""}`}
                >
                  {hours.map((h) => (
                    <div key={h} className="border-t border-border/50" style={{ height: ROW_H }} />
                  ))}

                  {hoje && nowTop !== null && (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                      style={{ top: nowTop }}
                    >
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span className="h-px flex-1 bg-primary" />
                    </div>
                  )}

                  {eventsFor(day).map((r) => {
                    const dt = new Date(r.visita_at as string);
                    if (dt.getHours() < START_HOUR || dt.getHours() > END_HOUR) return null;
                    const top =
                      ((dt.getHours() - START_HOUR) * 60 + dt.getMinutes()) * (ROW_H / 60);
                    const c = STAGE_BG[r.stage];
                    return (
                      <Popover key={r.id}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="absolute left-1 right-1 z-20 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-sm transition hover:brightness-95"
                            style={{
                              top: Math.max(top, 0),
                              minHeight: 46,
                              background: c.bg,
                              color: c.fg,
                              borderColor: c.border,
                            }}
                          >
                            <span className="block truncate text-xs font-semibold">
                              {format(dt, "HH:mm")} · {r.leads?.nome_cliente ?? "Lead"}
                            </span>
                            <span className="block truncate text-[11px] opacity-80">
                              {r.total_cliente ? money(r.total_cliente) : STAGE_LABEL[r.stage]}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2">
                          <p className="px-1 pb-1 text-xs font-semibold">
                            {r.leads?.nome_cliente ?? "Lead"}
                          </p>
                          <p className="px-1 pb-2 text-[11px] text-muted-foreground">
                            {format(dt, "EEE d MMM · HH:mm", { locale: ptBR })}
                          </p>
                          <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
                            Mover para
                          </p>
                          <div className="flex flex-col">
                            {STAGE_ORDER.map((s) => {
                              const active = s === r.stage;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={active}
                                  onClick={() => onChangeStage(r.id, s)}
                                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${
                                    active ? "opacity-60" : ""
                                  }`}
                                >
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ background: STAGE_BG[s].dot }}
                                  />
                                  <span className="flex-1">{STAGE_LABEL[s]}</span>
                                  {active && <Check className="h-3.5 w-3.5" />}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-1 border-t pt-1">
                            <button
                              type="button"
                              onClick={() => onSelect(r.id)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                            >
                              <Eye className="h-3.5 w-3.5" /> Ver detalhes
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
