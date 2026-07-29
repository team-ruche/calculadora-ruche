import { useEffect, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalItem,
  type MotorGrupo,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
  extra: "Extras",
};
const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

type PropRow = Proposal & {
  leads: { nome_cliente: string; endereco: string | null; telefone: string | null } | null;
};

// Documento do orçamento (somente leitura) + exportar PDF + editar.
// Reutilizado no Overview (kanban/calendário) e onde for preciso abrir o orçamento.
export function OrcamentoView({
  open,
  proposalId,
  onOpenChange,
  onEdit,
}: {
  open: boolean;
  proposalId: string | null;
  onOpenChange: (o: boolean) => void;
  onEdit?: () => void;
}) {
  const [row, setRow] = useState<PropRow | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !proposalId) return;
    (async () => {
      setLoading(true);
      const { data: prop } = await supabase
        .from("proposals")
        .select("*, leads(nome_cliente, endereco, telefone)")
        .eq("id", proposalId)
        .maybeSingle();
      setRow((prop as PropRow) ?? null);
      const { data: its } = await supabase
        .from("proposal_items")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("grupo");
      setItems((its as ProposalItem[]) ?? []);
      setLoading(false);
    })();
  }, [open, proposalId]);

  const cliente = row?.leads?.nome_cliente || "Cliente";

  const printPdf = () => {
    const linhas = GRUPO_ORDER.map((grupo) => {
      const grp = items.filter((i) => i.grupo === grupo);
      if (!grp.length) return "";
      const rows = grp
        .map(
          (i) => `<tr><td>${i.componente}</td>
            <td style="text-align:right">${i.quantidade} ${i.unidade}</td>
            <td style="text-align:right">${money(i.preco_cliente_unit)}</td>
            <td style="text-align:right">${money(i.subtotal_cliente)}</td></tr>`,
        )
        .join("");
      return `<tr><th colspan="4" style="text-align:left;background:#f3f3f3;padding:6px">${GRUPO_LABEL[grupo]}</th></tr>${rows}`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento — ${cliente}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}h1{margin:0 0 4px}.muted{color:#666;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:6px}.total{font-size:18px;font-weight:bold;text-align:right;margin-top:16px}</style>
      </head><body><h1>Orçamento — ${cliente}</h1>
      <div class="muted">${row?.leads?.endereco ?? ""}${row?.leads?.endereco ? " · " : ""}${row?.leads?.telefone ?? ""}</div>
      <table><thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qtd</th><th style="text-align:right">Unit</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${linhas}</tbody></table>
      <div class="total">Total: ${money(row?.total_cliente ?? 0)}</div>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF");
    w.document.write(html);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Orçamento — {cliente}</DialogTitle>
              <DialogDescription>{row?.leads?.endereco || "Sem endereço"}</DialogDescription>
            </div>
            <div className="flex gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={printPdf}
                disabled={loading || !items.length}
              >
                <Printer className="mr-1 h-4 w-4" /> PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando itens…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem itens precificados neste orçamento.
          </p>
        ) : (
          <div className="space-y-4">
            {GRUPO_ORDER.map((grupo) => {
              const grp = items.filter((i) => i.grupo === grupo);
              if (!grp.length) return null;
              return (
                <div key={grupo}>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                    {GRUPO_LABEL[grupo]}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Unit</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grp.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell>{i.componente}</TableCell>
                          <TableCell className="text-right">
                            {i.quantidade} {i.unidade}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(i.preco_cliente_unit)}
                          </TableCell>
                          <TableCell className="text-right">{money(i.subtotal_cliente)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
            <div className="flex justify-end border-t pt-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Valor da proposta</p>
                <p className="text-3xl font-bold">{money(row?.total_cliente ?? 0)}</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
