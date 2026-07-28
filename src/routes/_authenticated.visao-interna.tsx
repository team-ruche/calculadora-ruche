import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, FileText, Search } from "lucide-react";
import {
  supabase,
  type Proposal,
  type Parcela,
  type ParcelaStatus,
  type ContractStatus,
  type Direcao,
  PARCELA_STATUS_LABEL,
  CONTRACT_STATUS_LABEL,
  PAYMENT_METHODS,
  CONTAS,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ParcelaDialog } from "@/components/ParcelaDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/visao-interna")({
  head: () => ({ meta: [{ title: "Controle Financeiro · Ruche" }] }),
  component: VisaoInternaPage,
});

type Deal = Proposal & { leads: { nome_cliente: string } | null };

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const PARCELA_BADGE: Record<ParcelaStatus, { bg: string; fg: string }> = {
  pago: { bg: "#D3E8BC", fg: "#2C5212" },
  em_dia: { bg: "#E6F1FB", fg: "#0C447C" },
  vence_7d: { bg: "#FBE7BF", fg: "#7A4E05" },
  vence_hoje: { bg: "#FAC775", fg: "#633806" },
  em_atraso: { bg: "#F7C1C1", fg: "#791F1F" },
  negociacao: { bg: "#F5DDB4", fg: "#7A4405" },
  processing: { bg: "#D3D1C7", fg: "#2C2C2A" },
};

const recebidoDe = (ps: Parcela[]) =>
  ps.reduce((a, p) => a + (p.status === "pago" ? (p.valor_pago ?? p.valor) : 0), 0);

function VisaoInternaPage() {
  const { isRuche } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [busca, setBusca] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: dealData, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente)")
      .eq("stage", "deal")
      .order("fechado_at", { ascending: false });
    if (error) toast.error(error.message);
    const ds = (dealData as Deal[]) ?? [];
    setDeals(ds);

    if (ds.length) {
      const { data: pData } = await supabase
        .from("parcelas")
        .select("*")
        .in(
          "proposal_id",
          ds.map((d) => d.id),
        )
        .order("numero");
      setParcelas((pData as Parcela[]) ?? []);
    } else {
      setParcelas([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  const parcelasDe = useMemo(() => {
    const m: Record<string, Parcela[]> = {};
    for (const p of parcelas) (m[p.proposal_id] ??= []).push(p);
    return m;
  }, [parcelas]);

  if (!isRuche) return <Navigate to="/overview" />;

  // KPIs
  const totalVendido = deals.reduce((a, d) => a + (d.total_cliente ?? 0), 0);
  const totalParceiro = deals.reduce((a, d) => a + (d.total_repasse ?? 0), 0);
  const totalRuche = deals.reduce((a, d) => a + (d.margem_ruche ?? 0), 0);
  const totalRecebido = recebidoDe(parcelas);
  const pctRecebido = totalRuche > 0 ? Math.round((totalRecebido / totalRuche) * 100) : 0;

  const setContrato = async (id: string, cs: ContractStatus) => {
    const { error } = await supabase.from("proposals").update({ contract_status: cs }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  if (selected) {
    return (
      <DealDetail
        deal={selected}
        parcelas={parcelasDe[selected.id] ?? []}
        onBack={() => {
          setSelected(null);
          load();
        }}
        onChanged={load}
      />
    );
  }

  const filtrados = deals.filter((d) =>
    (d.leads?.nome_cliente ?? "").toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Controle Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Deals vendidos: vendido, parceiro, Ruche e o que já foi recebido (repasse do parceiro).
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-[#2C2C2A] p-4">
          <p className="text-xs uppercase tracking-wide text-[#D3D1C7]">Total vendido</p>
          <p className="mt-1.5 text-2xl font-bold text-white">{money(totalVendido)}</p>
          <p className="mt-1 text-xs text-[#B4B2A9]">{deals.length} deals fechados</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total parceiro</p>
          <p className="mt-1.5 text-2xl font-bold">{money(totalParceiro)}</p>
          <p className="mt-1 text-xs text-muted-foreground">fica com o parceiro</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Ruche</p>
          <p className="mt-1.5 text-2xl font-bold">{money(totalRuche)}</p>
          <p className="mt-1 text-xs text-muted-foreground">a receber do parceiro</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#F0A81E" }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: "#633806" }}>
            Recebido pela Ruche
          </p>
          <p className="mt-1.5 text-2xl font-bold" style={{ color: "#412402" }}>
            {money(totalRecebido)}
          </p>
          <p className="mt-1 text-xs" style={{ color: "#7A4E05" }}>
            {pctRecebido}% do total Ruche
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Parceiro</TableHead>
                  <TableHead className="text-right">Ruche</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((d) => {
                  const ps = parcelasDe[d.id] ?? [];
                  const pagas = ps.filter((p) => p.status === "pago").length;
                  const receb = recebidoDe(ps);
                  const aReceber = (d.margem_ruche ?? 0) - receb;
                  return (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => setSelected(d)}>
                      <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                        {d.leads?.nome_cliente || "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={d.contract_status}
                          onValueChange={(v) => setContrato(d.id, v as ContractStatus)}
                        >
                          <SelectTrigger className="h-8 w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                {CONTRACT_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {pagas}/{ps.length}
                      </TableCell>
                      <TableCell className="text-right">{money(d.total_cliente)}</TableCell>
                      <TableCell className="text-right">{money(d.total_repasse)}</TableCell>
                      <TableCell className="text-right">{money(d.margem_ruche)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{money(receb)}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${aReceber > 0 ? "" : "text-emerald-600"}`}
                      >
                        {money(aReceber)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Nenhum deal vendido ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Detalhe do deal --------------------------------------------------------
function DealDetail({
  deal,
  parcelas,
  onBack,
  onChanged,
}: {
  deal: Deal;
  parcelas: Parcela[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Parcela | "novo" | null>(null);
  const receb = recebidoDe(parcelas);
  const cliente = deal.leads?.nome_cliente ?? "Cliente";

  const proximoNumero = (parcelas.at(-1)?.numero ?? 0) + 1;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{cliente}</h1>
          <p className="text-sm text-muted-foreground">
            Deal · {CONTRACT_STATUS_LABEL[deal.contract_status]}
            {deal.fechado_at
              ? ` · fechado ${new Date(deal.fechado_at).toLocaleDateString("pt-BR")}`
              : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing("novo")}>
          <Plus className="mr-1 h-4 w-4" /> Nova parcela
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi label="Vendido" value={money(deal.total_cliente)} />
        <MiniKpi label="Parceiro" value={money(deal.total_repasse)} />
        <MiniKpi label="Ruche" value={money(deal.margem_ruche)} />
        <MiniKpi label="Recebido" value={money(receb)} success />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Parte Ruche</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parcelas.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setEditing(p)}>
                  <TableCell>{p.numero}</TableCell>
                  <TableCell>
                    {p.vencimento ? new Date(p.vencimento).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>{p.periodo || "—"}</TableCell>
                  <TableCell>{p.payment_method || "—"}</TableCell>
                  <TableCell>{p.conta || "—"}</TableCell>
                  <TableCell className="text-right">{money(p.valor)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {money(p.valor_ruche)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.valor_pago != null ? money(p.valor_pago) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: PARCELA_BADGE[p.status].bg,
                        color: PARCELA_BADGE[p.status].fg,
                      }}
                    >
                      {PARCELA_STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {parcelas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhuma parcela. As parcelas vêm acordadas na venda, ou adicione manualmente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ParcelaDialog
        open={editing !== null}
        parcela={editing === "novo" ? null : editing}
        proposalId={deal.id}
        cliente={cliente}
        proximoNumero={proximoNumero}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}

function MiniKpi({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${success ? "text-emerald-600" : ""}`}>{value}</p>
    </div>
  );
}
