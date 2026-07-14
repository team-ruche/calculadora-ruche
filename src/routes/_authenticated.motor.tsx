import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, type MotorPrice, type MotorGrupo } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/motor")({
  head: () => ({ meta: [{ title: "Precificação · Ruche" }] }),
  component: MotorPage,
});

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

function MotorPage() {
  const { isRuche } = useAuth();
  const [prices, setPrices] = useState<MotorPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("motor_prices")
      .select("*")
      .order("grupo")
      .order("componente");
    if (error) toast.error(error.message);
    else setPrices((data as MotorPrice[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  if (!isRuche) return <Navigate to="/overview" />;

  const patchLocal = (id: string, patch: Partial<MotorPrice>) =>
    setPrices((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const saveRow = async (row: MotorPrice) => {
    if (row.repasse_partida > row.teto_repasse) {
      toast.error("Repasse de partida não pode ser maior que o teto");
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from("motor_prices")
      .update({
        preco_cliente: row.preco_cliente,
        repasse_partida: row.repasse_partida,
        teto_repasse: row.teto_repasse,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success(`${row.componente} atualizado`);
  };

  const toggleAtivo = async (row: MotorPrice, ativo: boolean) => {
    patchLocal(row.id, { ativo });
    const { error } = await supabase.from("motor_prices").update({ ativo }).eq("id", row.id);
    if (error) {
      patchLocal(row.id, { ativo: !ativo });
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Precificação</h1>
        <p className="text-sm text-muted-foreground">
          Preço cobrado do cliente e banda de repasse ao parceiro (partida → teto), por unidade.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        GRUPO_ORDER.map((grupo) => {
          const rows = prices.filter((p) => p.grupo === grupo);
          if (!rows.length) return null;
          return (
            <Card key={grupo}>
              <CardHeader>
                <CardTitle>{GRUPO_LABEL[grupo]}</CardTitle>
                <CardDescription>
                  {grupo === "extra" ? "Valores por unidade do extra" : "Valores por sqft"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Componente</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="w-32">Preço cliente</TableHead>
                      <TableHead className="w-32">Repasse partida</TableHead>
                      <TableHead className="w-32">Teto repasse</TableHead>
                      <TableHead className="w-20">Ativo</TableHead>
                      <TableHead className="w-24 text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.componente}</TableCell>
                        <TableCell className="text-muted-foreground">{row.unidade}</TableCell>
                        <TableCell>
                          <NumCell
                            value={row.preco_cliente}
                            onChange={(v) => patchLocal(row.id, { preco_cliente: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <NumCell
                            value={row.repasse_partida}
                            onChange={(v) => patchLocal(row.id, { repasse_partida: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <NumCell
                            value={row.teto_repasse}
                            onChange={(v) => patchLocal(row.id, { teto_repasse: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={row.ativo}
                            onCheckedChange={(v) => toggleAtivo(row, v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingId === row.id}
                            onClick={() => saveRow(row)}
                          >
                            {savingId === row.id ? "…" : "Salvar"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      min={0}
      step="0.01"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8"
    />
  );
}
