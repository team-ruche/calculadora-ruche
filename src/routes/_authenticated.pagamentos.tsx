import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import {
  supabase,
  PAYMENT_METHODS,
  type Parcela,
  type Proposal,
} from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({ meta: [{ title: "Payments · Ruche" }] }),
  component: PagamentosPage,
});

type Linha = Parcela & {
  proposals:
    | (Pick<Proposal, "id" | "total_cliente"> & {
        leads: { nome_cliente: string } | null;
      })
    | null;
};

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dstr = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const hoje = () => new Date().toISOString().slice(0, 10);

// Dias em relacao ao vencimento do REPASSE. Enquanto o cliente nao pagou nao
// ha prazo correndo — e por isso que vencimento nasce nulo.
const diasAtraso = (p: Parcela): number | null => {
  if (!p.vencimento || p.data_pagamento) return null;
  const v = new Date(p.vencimento + "T00:00:00").getTime();
  const h = new Date(hoje() + "T00:00:00").getTime();
  return Math.round((h - v) / 86400000);
};

function Situacao({ p }: { p: Parcela }) {
  if (p.data_pagamento)
    return (
      <span className="inline-flex items-center gap-1 text-sm text-[#2C7A3F]">
        <CheckCircle2 className="h-4 w-4" /> Remitted
      </span>
    );
  if (!p.cliente_pagou_em)
    return <span className="text-sm text-muted-foreground">Awaiting customer</span>;
  const d = diasAtraso(p);
  if (d !== null && d > 0)
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[#B42318]">
        <AlertTriangle className="h-4 w-4" /> {d}d overdue
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[#7A4E05]">
      <Clock className="h-4 w-4" /> Due {dstr(p.vencimento)}
    </span>
  );
}

function PagamentosPage() {
  const { isRuche } = useAuth();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);
  const [alvo, setAlvo] = useState<Linha | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("parcelas")
      .select("*, proposals(id, total_cliente, leads(nome_cliente))")
      .order("vencimento", { nullsFirst: false })
      .order("numero");
    if (error) toast.error(error.message);
    setLinhas((data as Linha[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isRuche) load();
  }, [isRuche]);

  const totais = useMemo(() => {
    const aRepassar = linhas
      .filter((p) => !p.data_pagamento && p.cliente_pagou_em)
      .reduce((a, p) => a + (p.valor_ruche ?? 0), 0);
    const atrasado = linhas
      .filter((p) => (diasAtraso(p) ?? 0) > 0)
      .reduce((a, p) => a + (p.valor_ruche ?? 0), 0);
    const aguardando = linhas.filter((p) => !p.cliente_pagou_em).length;
    return { aRepassar, atrasado, aguardando };
  }, [linhas]);

  if (!isRuche) return <Navigate to="/overview" replace />;

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Customer payments and partner remittances." />

      <div className="metric-grid grid gap-3 sm:grid-cols-3">
        <MetricCard label="To remit" value={money(totais.aRepassar)} loading={loading} />
        <MetricCard
          label="Overdue"
          value={money(totais.atrasado)}
          tone="danger"
          loading={loading}
        />
        <MetricCard label="Awaiting customer" value={String(totais.aguardando)} loading={loading} />
      </div>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>#</TableHead>
              <TableHead className="text-right">Customer pays</TableHead>
              <TableHead className="text-right">You remit</TableHead>
              <TableHead>Customer paid on</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!loading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No installments yet. They show up once a deal is closed and the schedule is
                  generated.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-[220px] truncate">
                  {p.proposals?.leads?.nome_cliente ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums">{p.numero}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.valor)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(p.valor_ruche)}
                </TableCell>
                <TableCell className="tabular-nums">{dstr(p.cliente_pagou_em) || "—"}</TableCell>
                <TableCell>
                  <Situacao p={p} />
                </TableCell>
                <TableCell className="text-right">
                  {!p.cliente_pagou_em && !isRuche && (
                    <Button size="sm" variant="outline" onClick={() => setAlvo(p)}>
                      Customer paid
                    </Button>
                  )}
                  {!p.cliente_pagou_em && isRuche && (
                    <Button size="sm" variant="ghost" onClick={() => setAlvo(p)}>
                      Record for partner
                    </Button>
                  )}
                  {p.comprovante_url && (
                    <a
                      href={p.comprovante_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-sm underline"
                    >
                      Proof
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DeclararDialog parcela={alvo} onClose={() => setAlvo(null)} onSaved={load} />
    </div>
  );
}

function DeclararDialog({
  parcela,
  onClose,
  onSaved,
}: {
  parcela: Linha | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(hoje());
  const [metodo, setMetodo] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (parcela) {
      setData(hoje());
      setMetodo(parcela.payment_method ?? "");
      setArquivo(null);
    }
  }, [parcela]);

  const salvar = async () => {
    if (!parcela) return;
    setSalvando(true);
    try {
      let url = parcela.comprovante_url;
      if (arquivo) {
        const path = `${parcela.proposal_id}/${parcela.id}-${arquivo.name}`;
        const { error: upErr } = await supabase.storage
          .from("payment-proofs")
          .upload(path, arquivo, { upsert: true });
        if (upErr) throw upErr;
        // Bucket privado: link assinado, valido por 1 ano.
        const { data: signed } = await supabase.storage
          .from("payment-proofs")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        url = signed?.signedUrl ?? null;
      }
      const { error } = await supabase.rpc("rpc_declarar_pagamento_cliente", {
        p_parcela_id: parcela.id,
        p_data: data,
        p_comprovante_url: url,
        p_payment_method: metodo || null,
      });
      if (error) throw error;
      toast.success("Payment recorded. The remittance clock starts now.");
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!parcela} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customer paid</DialogTitle>
          <DialogDescription>
            {parcela?.proposals?.leads?.nome_cliente} · installment {parcela?.numero} ·{" "}
            {money(parcela?.valor)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="data">Date the customer paid you</Label>
            <Input
              id="data"
              type="date"
              max={hoje()}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              You have 3 business days from this date to remit {money(parcela?.valor_ruche)}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>How they paid</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proof">Proof of payment</Label>
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <Input
                id="proof"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Cancel
          </Button>
          <Button onClick={salvar} disabled={salvando || !data}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
