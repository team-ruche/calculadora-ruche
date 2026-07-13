import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Overview · Ruche" }] }),
  component: Overview,
});

function Overview() {
  const { user, isRuche } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Bem-vindo, {user?.nome || user?.email}. {isRuche ? "Você tem acesso total." : "Você é parceiro."}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Orçamentos criados" value="—" />
        <MetricCard label="Em andamento" value="—" />
        <MetricCard label="Fechados" value="—" />
        <MetricCard label="Pipeline (USD)" value="—" highlight />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Próximos passos</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Etapa 1 (autenticação, papéis, aprovação) concluída. As próximas etapas incluirão o formulário de Input,
          o Motor de Preços, a geração do orçamento e o tracker.
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "bg-primary text-primary-foreground" : ""}>
      <CardContent className="p-6">
        <p className={`text-xs uppercase tracking-wider ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="mt-2 text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
