import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview · Ruche" }] }),
  component: Overview,
});

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Stats {
  criados: number;
  andamento: number;
  fechados: number;
  pipeline: number;
}

function Overview() {
  const { user, isRuche } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("proposals").select("status, total_cliente");
      if (error || !data) return;
      const rows = data as { status: string; total_cliente: number | null }[];
      setStats({
        criados: rows.length,
        andamento: rows.filter((r) => r.status === "rascunho" || r.status === "enviado").length,
        fechados: rows.filter((r) => r.status === "fechado").length,
        pipeline: rows.reduce((acc, r) => acc + (r.total_cliente ?? 0), 0),
      });
    })();
  }, []);

  const show = (n: number | undefined) => (stats ? String(n) : "—");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo, {user?.nome || user?.email}.{" "}
          {isRuche ? "Você tem acesso total." : "Você é parceiro."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Orçamentos criados" value={show(stats?.criados)} />
        <MetricCard label="Em andamento" value={show(stats?.andamento)} />
        <MetricCard label="Fechados" value={show(stats?.fechados)} />
        <MetricCard label="Pipeline (USD)" value={stats ? money(stats.pipeline) : "—"} highlight />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "bg-primary text-primary-foreground" : ""}>
      <CardContent className="p-6">
        <p
          className={`text-xs uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
        >
          {label}
        </p>
        <p className="mt-2 text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
