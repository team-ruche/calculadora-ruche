import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  Phone,
  MessageSquare,
  ExternalLink,
  ClipboardList,
  Calendar as CalendarIcon,
  MapPin,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ProposalStage } from "@/integrations/supabase/models";
import { STAGE_LABEL, STAGE_ORDER } from "@/integrations/supabase/models";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CalRow = {
  id: string;
  visita_at: string | null;
  stage: ProposalStage;
  total_cliente: number | null;
  leads: {
    nome_cliente: string | null;
    endereco: string | null;
    telefone: string | null;
  } | null;
};

const STAGE_BG: Record<ProposalStage, { bg: string; fg: string; border: string; dot: string }> = {
  appointment_confirmed: { bg: "#FCEED2", fg: "#5C3B04", border: "#F0A81E", dot: "#F0A81E" },
  appointment_canceled: { bg: "#F9E1D7", fg: "#5C2410", border: "#E07A52", dot: "#E07A52" },
  negotiation: { bg: "#E6F1FB", fg: "#0C447C", border: "#185FA5", dot: "#185FA5" },
  no_deal: { bg: "#E6E4DB", fg: "#3A3934", border: "#9C9A90", dot: "#9C9A90" },
  deal: { bg: "#DFEECB", fg: "#204009", border: "#5FA13B", dot: "#5FA13B" },
};

const START_HOUR = 0; // meia-noite
const END_HOUR = 23; // 23h (rola até meia-noite embaixo)
const ROW_H = 60;
const DEFAULT_SCROLL_HOUR = 9; // abre com 9h no topo

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
  onOrcamento: (id: string) => void;
}

export function PipelineCalendar({
  rows,
  weekStart,
  onWeekStart,
  onSelect,
  onChangeStage,
  onOrcamento,
}: Props) {
  const isMobile = useIsMobile();
  // No mobile a visão é de 1 dia (começando hoje); no desktop, a semana toda.
  const [mobileDay, setMobileDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const visibleDays = isMobile ? [mobileDay] : days;
  const gridCols = `60px repeat(${visibleDays.length}, minmax(0, 1fr))`;
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const now = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - START_HOUR) * ROW_H;
  }, []);

  const move = (delta: number) => {
    if (isMobile) {
      const d = new Date(mobileDay);
      d.setDate(d.getDate() + delta);
      setMobileDay(d);
      return;
    }
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    onWeekStart(d);
  };
  const irHoje = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setMobileDay(t);
    onWeekStart(startOfWeek(new Date()));
  };

  // Deslizar pro lado troca o dia (mobile). Só age em swipe horizontal claro.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || !touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
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
        <Button variant="outline" size="sm" onClick={irHoje}>
          Hoje
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-semibold">
            {isMobile
              ? format(mobileDay, "EEE, d MMM yyyy", { locale: ptBR })
              : `${format(days[0], "d MMM", { locale: ptBR })} – ${format(days[6], "d MMM yyyy", { locale: ptBR })}`}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="ml-auto hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
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

      <div className="overflow-x-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className={isMobile ? "w-full" : "min-w-[840px]"}>
          {/* Cabeçalho dos dias */}
          <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {visibleDays.map((d) => {
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

          {/* Grade (rolagem vertical: meia-noite a meia-noite) */}
          <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: gridCols }}>
              {/* Gutter de horas */}
              <div>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="relative border-t border-border/50"
                    style={{ height: ROW_H }}
                  >
                    <span className="absolute right-2 top-1 text-[11px] text-muted-foreground">
                      {hourLabel(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Colunas dos dias */}
              {visibleDays.map((day) => {
                const hoje = isSameDay(day, now);
                return (
                  <div
                    key={day.toISOString()}
                    className={`relative border-l border-border/50 ${hoje ? "bg-primary/5" : ""}`}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="border-t border-border/50"
                        style={{ height: ROW_H }}
                      />
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
                          <PopoverContent align="start" className="w-64 p-2">
                            <p className="px-1 text-sm font-semibold">
                              {r.leads?.nome_cliente ?? "Lead"}
                            </p>
                            <div className="space-y-1 px-1 pb-2 pt-1 text-[11px] text-muted-foreground">
                              <p className="flex items-center gap-1.5">
                                <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                {format(dt, "EEE d MMM · HH:mm", { locale: ptBR })}
                              </p>
                              <p className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">
                                  {r.leads?.endereco ?? "Endereço a confirmar"}
                                </span>
                              </p>
                              <p className="flex items-center gap-1.5 font-medium text-foreground">
                                <DollarSign className="h-3.5 w-3.5 shrink-0" />
                                {money(r.total_cliente)}
                                {!r.total_cliente && (
                                  <span className="font-normal text-muted-foreground">
                                    (após orçamento)
                                  </span>
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 border-t px-1 py-2">
                              <IconBtn label="GHL">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn label="Google Calendar">
                                <CalendarIcon className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                label="Ligar"
                                href={r.leads?.telefone ? `tel:${r.leads.telefone}` : undefined}
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                label="SMS"
                                href={r.leads?.telefone ? `sms:${r.leads.telefone}` : undefined}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </IconBtn>
                              <IconBtn
                                label="Orçamento / medição"
                                onClick={() => onOrcamento(r.id)}
                                accent={!(r.total_cliente && r.total_cliente > 0)}
                              >
                                <ClipboardList className="h-3.5 w-3.5" />
                              </IconBtn>
                            </div>

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
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  href,
  accent,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  accent?: boolean;
}) {
  const cls = `flex h-7 w-7 items-center justify-center rounded-md border ${
    accent
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-border bg-background text-muted-foreground hover:text-foreground"
  }`;
  return href ? (
    <a href={href} aria-label={label} title={label} className={cls}>
      {children}
    </a>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
