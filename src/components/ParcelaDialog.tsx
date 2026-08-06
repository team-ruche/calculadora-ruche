import { useEffect, useState } from "react";
import { Loader2, Trash2, Copy, FileText, DollarSign, Check } from "lucide-react";
import {
  supabase,
  type Parcela,
  type ParcelaStatus,
  type Direcao,
  PARCELA_STATUS_LABEL,
  PAYMENT_METHODS,
  CONTAS,
} from "@/integrations/supabase/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";

type Draft = {
  payment_method: string;
  conta: string;
  direcao: Direcao;
  periodo: string;
  valor: string;
  valor_parceiro: string;
  valor_ruche: string;
  vencimento: string;
  data_pagamento: string;
  valor_pago: string;
  status: ParcelaStatus;
  conciliado: boolean;
  invoice_gerada: boolean;
  valor_nativo: string;
  moeda_nativa: string;
  notas: string;
};

const NONE = "—";
const dstr = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const nstr = (n: number | null) => (n == null ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

const fromParcela = (p: Parcela | null): Draft => ({
  payment_method: p?.payment_method ?? "",
  conta: p?.conta ?? "",
  direcao: p?.direcao ?? "inflow",
  periodo: p?.periodo ?? "",
  valor: nstr(p?.valor ?? null),
  valor_parceiro: nstr(p?.valor_parceiro ?? null),
  valor_ruche: nstr(p?.valor_ruche ?? null),
  vencimento: dstr(p?.vencimento ?? null),
  data_pagamento: dstr(p?.data_pagamento ?? null),
  valor_pago: nstr(p?.valor_pago ?? null),
  status: p?.status ?? "em_dia",
  conciliado: p?.conciliado ?? false,
  invoice_gerada: p?.invoice_gerada ?? false,
  valor_nativo: nstr(p?.valor_nativo ?? null),
  moeda_nativa: p?.moeda_nativa ?? "",
  notas: p?.notas ?? "",
});

export function ParcelaDialog({
  open,
  parcela,
  proposalId,
  cliente,
  proximoNumero,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  parcela: Parcela | null;
  proposalId: string;
  cliente: string;
  proximoNumero: number;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(fromParcela(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setD(fromParcela(parcela));
  }, [open, parcela]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const payload = () => ({
    payment_method: d.payment_method || null,
    conta: d.conta || null,
    direcao: d.direcao,
    periodo: d.periodo || null,
    valor: num(d.valor) ?? 0,
    valor_parceiro: num(d.valor_parceiro),
    valor_ruche: num(d.valor_ruche),
    vencimento: d.vencimento || null,
    data_pagamento: d.data_pagamento || null,
    valor_pago: num(d.valor_pago),
    status: d.status,
    conciliado: d.conciliado,
    invoice_gerada: d.invoice_gerada,
    valor_nativo: num(d.valor_nativo),
    moeda_nativa: d.moeda_nativa || null,
    notas: d.notas || null,
  });

  const save = async () => {
    setSaving(true);
    const body = payload();
    const err = parcela
      ? (await supabase.from("parcelas").update(body).eq("id", parcela.id)).error
      : (
          await supabase
            .from("parcelas")
            .insert({ ...body, proposal_id: proposalId, numero: proximoNumero })
        ).error;
    setSaving(false);
    if (err) return toast.error(err.message);
    toast.success("Parcela salva");
    onSaved();
  };

  const remover = async () => {
    if (!parcela) return;
    if (!confirm(`Excluir a parcela ${parcela.numero}?`)) return;
    const { error } = await supabase.from("parcelas").delete().eq("id", parcela.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela excluída");
    onSaved();
  };

  const duplicar = async () => {
    const { error } = await supabase
      .from("parcelas")
      .insert({ ...payload(), proposal_id: proposalId, numero: proximoNumero });
    if (error) return toast.error(error.message);
    toast.success("Parcela duplicada");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>{parcela ? `Editar parcela ${parcela.numero}` : "Nova parcela"}</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-primary">
            <FileText className="h-3.5 w-3.5" /> {cliente} · orçamento do sistema
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Cliente">
              <Input value={cliente} disabled />
            </Campo>
            <Campo label="Forma de pagamento">
              <Select
                value={d.payment_method || NONE}
                onValueChange={(v) => set("payment_method", v === NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Conta">
              <Select
                value={d.conta || NONE}
                onValueChange={(v) => set("conta", v === NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {CONTAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Direção">
              <Select value={d.direcao} onValueChange={(v) => set("direcao", v as Direcao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inflow">Inflow (Ruche recebe)</SelectItem>
                  <SelectItem value="outflow">Outflow (saída)</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Período (MM/AAAA)">
              <Input
                value={d.periodo}
                onChange={(e) => set("periodo", e.target.value)}
                placeholder="08/2026"
              />
            </Campo>
            <Campo label="Status">
              <Select value={d.status} onValueChange={(v) => set("status", v as ParcelaStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PARCELA_STATUS_LABEL) as ParcelaStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {PARCELA_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>

            <Campo label="Valor da parcela (USD)">
              <Input type="number" value={d.valor} onChange={(e) => set("valor", e.target.value)} />
            </Campo>
            <Campo label="Parte parceiro">
              <Input
                type="number"
                value={d.valor_parceiro}
                onChange={(e) => set("valor_parceiro", e.target.value)}
              />
            </Campo>
            <Campo label="Parte Ruche">
              <Input
                type="number"
                value={d.valor_ruche}
                onChange={(e) => set("valor_ruche", e.target.value)}
              />
            </Campo>

            <Campo label="Vencimento">
              <Input
                type="date"
                value={d.vencimento}
                onChange={(e) => set("vencimento", e.target.value)}
              />
            </Campo>
            <Campo label="Data do pagamento">
              <Input
                type="date"
                value={d.data_pagamento}
                onChange={(e) => set("data_pagamento", e.target.value)}
              />
            </Campo>
            <Campo label="Valor pago (USD)">
              <Input
                type="number"
                value={d.valor_pago}
                onChange={(e) => set("valor_pago", e.target.value)}
              />
            </Campo>

            <Campo label="Conciliado">
              <Select
                value={d.conciliado ? "sim" : "nao"}
                onValueChange={(v) => set("conciliado", v === "sim")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Valor nativo (extrato)">
              <Input
                type="number"
                value={d.valor_nativo}
                onChange={(e) => set("valor_nativo", e.target.value)}
              />
            </Campo>
            <Campo label="Moeda nativa">
              <Input
                value={d.moeda_nativa}
                onChange={(e) => set("moeda_nativa", e.target.value)}
                placeholder="USD, BRL…"
              />
            </Campo>

            <div className="sm:col-span-3">
              <Label className="text-xs text-muted-foreground">Notas</Label>
              <Textarea
                rows={3}
                value={d.notas}
                onChange={(e) => set("notas", e.target.value)}
                placeholder="Cole um print (Ctrl+V) ou escreva…"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
          {parcela ? (
            <Button
              variant="outline"
              onClick={remover}
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap gap-2">
            {parcela && (
              <Button variant="outline" onClick={duplicar}>
                <Copy className="mr-1 h-4 w-4" /> Duplicar
              </Button>
            )}
            <Button
              variant={d.invoice_gerada ? "secondary" : "outline"}
              onClick={() => set("invoice_gerada", !d.invoice_gerada)}
            >
              {d.invoice_gerada ? (
                <Check className="mr-1 h-4 w-4" />
              ) : (
                <FileText className="mr-1 h-4 w-4" />
              )}
              Invoice gerada
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.info("Integração com o GHL ainda não configurada.")}
            >
              <DollarSign className="mr-1 h-4 w-4" /> Registrar no GHL
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
