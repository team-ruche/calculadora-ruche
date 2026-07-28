import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const fmt = (d: Date) => format(d, "d MMM yyyy");

interface Props {
  value: { from: Date; to: Date };
  onChange: (range: { from: Date; to: Date }) => void;
}

// Filtro global de período — presets + calendário duplo (formato do anexo).
export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);

  const applyPreset = (p: Preset) => {
    const r = presetRange(p);
    setDraft(r);
    onChange(r);
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
          className="m-1 h-12 gap-2.5 rounded-full border border-border bg-card px-7 text-[15px] font-bold text-foreground shadow-sm hover:bg-accent"
        >
          <CalendarIcon className="h-[18px] w-[18px] shrink-0 text-primary" />
          <span className="whitespace-nowrap">
            {fmt(value.from)} – {fmt(value.to)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          <div className="flex w-40 flex-col gap-0.5 border-r p-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
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
              numberOfMonths={2}
              defaultMonth={value.from}
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
