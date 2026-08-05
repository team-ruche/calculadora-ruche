import { useState } from "react";
import { Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Estado de um filtro de coluna. Só os campos do tipo usado ficam preenchidos.
export type FVal = {
  text?: string;
  sel?: string[];
  min?: string;
  max?: string;
  from?: string;
  to?: string;
};

export type ColFilters = Record<string, FVal>;

export const colFilterActive = (v?: FVal) =>
  !!(v && (v.text || (v.sel && v.sel.length) || v.min || v.max || v.from || v.to));

// Predicados de correspondência usados nas tabelas.
export const matchText = (field: string, f?: FVal) =>
  !f?.text || field.toLowerCase().includes(f.text.toLowerCase());
export const matchSel = (field: string, f?: FVal) => !f?.sel?.length || f.sel.includes(field);
export const matchNum = (n: number, f?: FVal) =>
  (!f?.min || n >= Number(f.min)) && (!f?.max || n <= Number(f.max));
export const matchDate = (iso: string | null, f?: FVal) => {
  if (!f?.from && !f?.to) return true;
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
};

type FilterType = "text" | "select" | "num" | "date";

// Botão de funil no cabeçalho da coluna + popover com o controle certo por tipo.
export function ColumnFilter({
  type,
  options,
  value,
  onChange,
  labelFor,
}: {
  type: FilterType;
  options?: readonly string[];
  value?: FVal;
  onChange: (v: FVal | undefined) => void;
  labelFor?: (o: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const v = value ?? {};
  const active = colFilterActive(value);
  const sel = v.sel ?? [];

  const toggleSel = (o: string) => {
    const next = sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o];
    onChange(next.length ? { ...v, sel: next } : { ...v, sel: undefined });
  };
  const set = (patch: Partial<FVal>) => {
    const merged = { ...v, ...patch };
    onChange(colFilterActive(merged) ? merged : undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Filtrar coluna"
          className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded align-middle ${
            active ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
        >
          <Filter className="h-3.5 w-3.5" fill={active ? "currentColor" : "none"} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3" onClick={(e) => e.stopPropagation()}>
        {type === "text" && (
          <Input
            autoFocus
            placeholder="Contém…"
            value={v.text ?? ""}
            onChange={(e) => set({ text: e.target.value || undefined })}
          />
        )}
        {type === "num" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="mín"
              value={v.min ?? ""}
              onChange={(e) => set({ min: e.target.value || undefined })}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              placeholder="máx"
              value={v.max ?? ""}
              onChange={(e) => set({ max: e.target.value || undefined })}
            />
          </div>
        )}
        {type === "date" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={v.from ?? ""}
              onChange={(e) => set({ from: e.target.value || undefined })}
            />
            <Input
              type="date"
              value={v.to ?? ""}
              onChange={(e) => set({ to: e.target.value || undefined })}
            />
          </div>
        )}
        {type === "select" && (
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {(options ?? []).map((o) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={sel.includes(o)}
                  onChange={() => toggleSel(o)}
                  className="h-3.5 w-3.5"
                />
                {labelFor ? labelFor(o) : o}
              </label>
            ))}
          </div>
        )}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            Limpar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
