import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Printer, Plus, Pencil } from "lucide-react";
import {
  supabase,
  type Proposal,
  type ProposalItem,
  type MotorGrupo,
} from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrcamentoForm } from "@/components/OrcamentoForm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type DialogState = { mode: "create" } | { mode: "edit"; proposalId: string } | null;

export const Route = createFileRoute("/_authenticated/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos · Ruche" }] }),
  component: OrcamentosPage,
});

type ProposalRow = Proposal & {
  leads: {
    nome_cliente: string;
    endereco: string | null;
    telefone: string | null;
    email: string | null;
  } | null;
};

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Instalação",
  demolicao: "Remoção",
  prep: "Preparação",
  extra: "Extras",
};

const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const money = (n: number | null) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  rascunho: "outline",
  enviado: "secondary",
  fechado: "default",
};

function OrcamentosPage() {
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProposalRow | null>(null);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("*, leads(nome_cliente, endereco, telefone, email)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as ProposalRow[]) ?? []);

    // Nomes dos autores (RLS: parceiro vê só o próprio; ruche vê todos)
    const { data: us } = await supabase.from("users").select("id, nome, email");
    if (us) {
      const map: Record<string, string> = {};
      for (const u of us as { id: string; nome: string; email: string }[]) {
        map[u.id] = u.nome || u.email;
      }
      setAuthors(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const reloadItems = async (proposalId: string) => {
    setItemsLoading(true);
    const { data, error } = await supabase
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("grupo");
    if (error) toast.error(error.message);
    else setItems((data as ProposalItem[]) ?? []);
    setItemsLoading(false);
  };

  const openDetail = async (row: ProposalRow) => {
    setSelected(row);
    await reloadItems(row.id);
  };

  const onSaved = async (proposalId: string) => {
    setDialog(null);
    await load();
    if (selected && selected.id === proposalId) {
      const { data } = await supabase
        .from("proposals")
        .select("*, leads(nome_cliente, endereco, telefone, email)")
        .eq("id", proposalId)
        .maybeSingle();
      if (data) setSelected(data as ProposalRow);
      await reloadItems(proposalId);
    }
  };

  const formDialog = (
    <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {dialog?.mode === "edit" ? "Editar orçamento" : "Novo orçamento"}
          </DialogTitle>
        </DialogHeader>
        {dialog && (
          <OrcamentoForm
            mode={dialog.mode}
            proposalId={dialog.mode === "edit" ? dialog.proposalId : undefined}
            onSaved={() =>
              onSaved(dialog.mode === "edit" ? dialog.proposalId : (selected?.id ?? ""))
            }
            onCancel={() => setDialog(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    return (
      <>
        {formDialog}
        <OrcamentoDetail
          row={selected}
          items={items}
          loading={itemsLoading}
          onEdit={() => setDialog({ mode: "edit", proposalId: selected.id })}
          onBack={() => {
            setSelected(null);
            setItems([]);
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {formDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Propostas geradas. Abra para ver o orçamento do cliente e exportar.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-1 h-4 w-4" /> Novo Orçamento
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Propostas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Última edição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor da proposta</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.leads?.nome_cliente || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {authors[row.partner_id] || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortDate(row.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {shortDate(row.updated_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{money(row.total_cliente)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openDetail(row)}>
                        <FileText className="mr-1 h-4 w-4" /> Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Nenhum orçamento ainda. Crie um em "Novo Orçamento".
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

function OrcamentoDetail({
  row,
  items,
  loading,
  onBack,
  onEdit,
}: {
  row: ProposalRow;
  items: ProposalItem[];
  loading: boolean;
  onBack: () => void;
  onEdit: () => void;
}) {
  const cliente = row.leads?.nome_cliente || "Cliente";

  const printPdf = () => {
    const linhas = GRUPO_ORDER.map((grupo) => {
      const grpItems = items.filter((i) => i.grupo === grupo);
      if (!grpItems.length) return "";
      const rowsHtml = grpItems
        .map(
          (i) => `<tr>
            <td>${i.componente}</td>
            <td style="text-align:right">${i.quantidade} ${i.unidade}</td>
            <td style="text-align:right">${money(i.preco_cliente_unit)}</td>
            <td style="text-align:right">${money(i.subtotal_cliente)}</td>
          </tr>`,
        )
        .join("");
      return `<tr><th colspan="4" style="text-align:left;background:#f3f3f3;padding:6px">${GRUPO_LABEL[grupo]}</th></tr>${rowsHtml}`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento — ${cliente}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px}
        h1{margin:0 0 4px} .muted{color:#666;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
        td,th{border-bottom:1px solid #ddd;padding:6px}
        .total{font-size:18px;font-weight:bold;text-align:right;margin-top:16px}
      </style></head><body>
      <h1>Orçamento — ${cliente}</h1>
      <div class="muted">${row.leads?.endereco ?? ""}${row.leads?.endereco ? " · " : ""}${row.leads?.telefone ?? ""}</div>
      <table>
        <thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qtd</th><th style="text-align:right">Unit</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="total">Total: ${money(row.total_cliente)}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) {
      toast.error("Permita pop-ups para exportar o PDF");
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{cliente}</h1>
            <p className="text-sm text-muted-foreground">{row.leads?.endereco || "Sem endereço"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" onClick={printPdf} disabled={loading || !items.length}>
            <Printer className="mr-1 h-4 w-4" /> Exportar PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orçamento do cliente</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando itens…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem itens precificados. Verifique se o Motor de Preços cobre os tipos usados.
            </p>
          ) : (
            <>
              {GRUPO_ORDER.map((grupo) => {
                const grpItems = items.filter((i) => i.grupo === grupo);
                if (!grpItems.length) return null;
                return (
                  <div key={grupo} className="mb-4">
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
                        {grpItems.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell>{i.componente}</TableCell>
                            <TableCell className="text-right">
                              {i.quantidade} {i.unidade}
                            </TableCell>
                            <TableCell className="text-right">
                              {money(i.preco_cliente_unit)}
                            </TableCell>
                            <TableCell className="text-right">
                              {money(i.subtotal_cliente)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
              <div className="mt-4 flex justify-end border-t pt-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Valor da proposta</p>
                  <p className="text-3xl font-bold">{money(row.total_cliente)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
