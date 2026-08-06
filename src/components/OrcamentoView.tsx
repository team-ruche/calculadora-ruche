import { useEffect, useState } from "react";
import { Pencil, Printer, RefreshCw } from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalItem,
  type MotorGrupo,
  type OrcamentoLayout,
  defaultLayout,
} from "@/integrations/supabase/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OrcamentoDocPreview, type DocData, type DocGrupo } from "@/components/OrcamentoDocPreview";
import { toast } from "sonner";

export const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
  extra: "Extras",
};
export const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

type PropRow = Proposal & {
  leads: {
    nome_cliente: string;
    endereco: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
};

async function resolveLayout(prop: PropRow): Promise<OrcamentoLayout> {
  if (prop.orcamento_layout) return prop.orcamento_layout as OrcamentoLayout;
  const { data } = await supabase
    .from("partner_orcamento_layout")
    .select("*")
    .eq("partner_id", prop.partner_id)
    .maybeSingle();
  return (data as OrcamentoLayout) ?? defaultLayout(prop.partner_id);
}

function buildDocData(prop: PropRow, items: ProposalItem[]): DocData {
  const grupos: DocGrupo[] = GRUPO_ORDER.map((g) => ({
    grupo: GRUPO_LABEL[g],
    itens: items
      .filter((i) => i.grupo === g)
      .map((i) => ({
        item: i.componente,
        qtd: `${i.quantidade} ${i.unidade}`,
        unit: money(i.preco_cliente_unit),
        subtotal: money(i.subtotal_cliente),
      })),
  })).filter((g) => g.itens.length > 0);

  const contato = [prop.leads?.telefone, prop.leads?.email].filter(Boolean).join(" · ");
  return {
    clienteNome: prop.leads?.nome_cliente || "Cliente",
    clienteContato: contato || "—",
    projetoEndereco: prop.leads?.endereco || "—",
    escopo: prop.leads?.endereco || "",
    grupos,
    total: money(prop.total_cliente),
  };
}

// Documento do orçamento (renderiza com o layout do parceiro) + PDF + editar + atualizar template.
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
  const [layout, setLayout] = useState<OrcamentoLayout | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = async () => {
    if (!proposalId) return;
    setLoading(true);
    const { data: prop } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente, endereco, telefone, email)")
      .eq("id", proposalId)
      .maybeSingle();
    const pr = (prop as PropRow) ?? null;
    setRow(pr);
    const { data: its } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("grupo");
    setItems((its as ProposalItem[]) ?? []);
    if (pr) setLayout(await resolveLayout(pr));
    setLoading(false);
  };

  useEffect(() => {
    if (open && proposalId) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposalId]);

  const cliente = row?.leads?.nome_cliente || "Cliente";
  const usandoSnapshot = !!row?.orcamento_layout;

  const atualizarTemplate = async () => {
    if (!row || !proposalId) return;
    const { data } = await supabase
      .from("partner_orcamento_layout")
      .select("*")
      .eq("partner_id", row.partner_id)
      .maybeSingle();
    const lay = (data as OrcamentoLayout) ?? defaultLayout(row.partner_id);
    const { error } = await supabase
      .from("proposals")
      .update({ orcamento_layout: lay })
      .eq("id", proposalId);
    if (error) return toast.error(error.message);
    setLayout(lay);
    toast.success("Documento atualizado com o template atual do parceiro");
    carregar();
  };

  const printPdf = () => {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return toast.error("Permita pop-ups para exportar o PDF");
    const node = document.getElementById("orc-doc");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento — ${cliente}</title></head><body style="margin:0">${node?.innerHTML ?? ""}<script>window.onload=function(){window.print()}</script></body></html>`,
    );
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>Orçamento — {cliente}</DialogTitle>
              <DialogDescription>
                {usandoSnapshot
                  ? "Layout congelado desta proposta"
                  : "Usando o template atual do parceiro"}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={atualizarTemplate}>
                <RefreshCw className="mr-1 h-4 w-4" /> Atualizar com template atual
              </Button>
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

        {loading || !layout ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sem itens precificados neste orçamento.
          </p>
        ) : (
          <div id="orc-doc" className="overflow-hidden rounded-lg border">
            <OrcamentoDocPreview layout={layout} data={buildDocData(row as PropRow, items)} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
