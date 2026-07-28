import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type DealPonto = {
  fechado_at: string | null;
  total_cliente: number | null;
  total_repasse: number | null;
  margem_ruche: number | null;
};

type Gran = "dia" | "semana" | "mes";
const GRAN_LABEL: Record<Gran, string> = { dia: "Diário", semana: "Semanal", mes: "Mensal" };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const axisMoney = (n: number) => `$${Math.round(n / 1000)}k`;

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function bucket(dateStr: string, g: Gran): { key: string; label: string } {
  const d = new Date(dateStr);
  if (g === "mes") {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: format(d, "MMM/yy", { locale: ptBR }) };
  }
  if (g === "semana") {
    const s = startOfWeek(d);
    return {
      key: format(s, "yyyy-MM-dd"),
      label: format(s, "dd/MM", { locale: ptBR }),
    };
  }
  return { key: format(d, "yyyy-MM-dd"), label: format(d, "dd/MM", { locale: ptBR }) };
}

export function ChartFaturamento({ deals }: { deals: DealPonto[] }) {
  const [gran, setGran] = useState<Gran>("mes");

  const data = useMemo(() => {
    const m = new Map<string, { label: string; total: number; parceiro: number; ruche: number }>();
    for (const d of deals) {
      if (!d.fechado_at) continue;
      const { key, label } = bucket(d.fechado_at, gran);
      const cur = m.get(key) ?? { label, total: 0, parceiro: 0, ruche: 0 };
      cur.total += d.total_cliente ?? 0;
      cur.parceiro += d.total_repasse ?? 0;
      cur.ruche += d.margem_ruche ?? 0;
      m.set(key, cur);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [deals, gran]);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Faturamento</h2>
        <div className="inline-flex rounded-lg border bg-background p-0.5">
          {(Object.keys(GRAN_LABEL) as Gran[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGran(g)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                gran === g ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {GRAN_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Sem faturamento no período.
        </p>
      ) : (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={axisMoney}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                formatter={(v: number, name) => [money(v), name]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="total"
                name="Faturamento total"
                fill="#EF9F27"
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
              />
              <Line
                type="monotone"
                dataKey="parceiro"
                name="Parceiro"
                stroke="#1D9E75"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="ruche"
                name="Ruche"
                stroke="#185FA5"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
