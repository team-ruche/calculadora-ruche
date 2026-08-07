import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type Preset = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "90d";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes_passado", label: "Mês passado" },
  { key: "90d", label: "Últimos 90 dias" },
];

export function presetRange(p: Preset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  switch (p) {
    case "hoje":
      return { from, to };
    case "7d":
      from.setDate(from.getDate() - 6);
      return { from, to };
    case "30d":
      from.setDate(from.getDate() - 29);
      return { from, to };
    case "90d":
      from.setDate(from.getDate() - 89);
      return { from, to };
    case "mes":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to };
    case "mes_passado":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
  }
}

const fmt = (d: Date) => format(d, "d MMM yy");

interface Props {
  value: { from: Date; to: Date } | null;
  onChange: (range: { from: Date; to: Date } | null) => void;
  // Permite limpar o filtro ("Todas as datas") — usado na cobrança.
  clearable?: boolean;
  placeholder?: string;
}

// Filtro global de período — presets + calendário duplo (formato do anexo).
export function DateRangePicker({ value, onChange, clearable, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value ?? undefined);
  const isMobile = useIsMobile();
  // No mobile o rótulo é bem curto (9/5 – 6/8); no desktop, completo.
  const label = value
    ? isMobile
      ? `${format(value.from, "d/M")} – ${format(value.to, "d/M")}`
      : `${fmt(value.from)} – ${fmt(value.to)}`
    : (placeholder ?? "Período");

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setDraft(r);
    onChange(r);
    setOpen(false);
  };

  const limpar = () => {
    setDraft(undefined);
    onChange(null);
    setOpen(false);
  };

  const onSelect = (r: DateRange | undefined) => {
    setDraft(r);
    if (r?.from && r?.to) {
      const from = new Date(r.from);
      from.setHours(0, 0, 0, 0);
      const to = new Date(r.to);
      to.setHours(23, 59, 59, 999);
      onChange({ from, to });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent sm:h-10 sm:gap-2 sm:px-4 sm:text-sm sm:font-semibold"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
          <span className="max-w-[46vw] truncate sm:max-w-none">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[94vw] p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:w-40 sm:flex-col sm:gap-0.5 sm:border-b-0 sm:border-r">
            {clearable && (
              <button
                type="button"
                onClick={limpar}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-accent sm:px-3 sm:py-2 sm:text-sm",
                  value ? "text-foreground" : "bg-accent text-foreground",
                )}
              >
                Todas as datas
              </button>
            )}
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent sm:px-3 sm:py-2 sm:text-sm",
                  "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={isMobile ? 1 : 2}
              defaultMonth={value?.from ?? new Date()}
              selected={draft}
              onSelect={onSelect}
              locale={ptBR}
            />
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Clique no início e no fim do período.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
