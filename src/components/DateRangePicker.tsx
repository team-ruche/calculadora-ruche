import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type Preset = "hoje" | "7d" | "30d" | "mes" | "mes_passado" | "90d";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "hoje", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "mes", label: "This month" },
  { key: "mes_passado", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
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
  // Allows clearing the filter ("All dates") — used in collections.
  clearable?: boolean;
  placeholder?: string;
}

// Global period filter — presets + dual calendar (attachment format).
export function DateRangePicker({ value, onChange, clearable, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value ?? undefined);
  const isMobile = useIsMobile();
  // Label always in the long format (9 May 26 – 13 Jun 26).
  const label = value ? `${fmt(value.from)} – ${fmt(value.to)}` : (placeholder ?? "Period");

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
          className="h-10 gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-brand-ink" />
          <span className="whitespace-nowrap">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,21rem)] p-0 sm:w-auto sm:max-w-none" align="end">
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
                All dates
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
          <div className="flex flex-col items-center p-2">
            <Calendar
              mode="range"
              numberOfMonths={isMobile ? 1 : 2}
              defaultMonth={value?.from ?? new Date()}
              selected={draft}
              onSelect={onSelect}
              locale={enUS}
            />
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Click the start and end of the range.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
