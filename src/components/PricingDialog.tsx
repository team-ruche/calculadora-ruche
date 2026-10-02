import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import {
  supabase,
  callRevisarOrcamento,
  PRICING_STATUS_LABEL,
  type AiReview,
  type PricingStatus,
  type ProposalItem,
  type MotorGrupo,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

const GRUPO_LABEL: Record<MotorGrupo, string> = {
  instalacao: "Installation",
  demolicao: "Removal",
  prep: "Preparation",
  extra: "Extras",
};
const GRUPO_ORDER: MotorGrupo[] = ["instalacao", "demolicao", "prep", "extra"];

const GRAVIDADE: Record<string, { bg: string; fg: string; label: string }> = {
  alta: { bg: "#F6D6C7", fg: "#7A2E12", label: "High" },
  media: { bg: "#FBE7BF", fg: "#7A4E05", label: "Medium" },
  baixa: { bg: "#DEDCD2", fg: "#45443D", label: "Low" },
};

type Draft = { quantidade: string; preco: string; repasse: string };

export function PricingDialog({
  proposalId,
  clienteNome,
  open,
  onOpenChange,
  onChanged,
}: {
  proposalId: string | null;
  clienteNome: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const { isRuche } = useAuth();
  const [itens, setItens] = useState<ProposalItem[]>([]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<PricingStatus>("auto");
  const [review, setReview] = useState<AiReview | null>(null);
  const [reviewAt, setReviewAt] = useState<string | null>(null);
  const [temTranscricao, setTemTranscricao] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [novo, setNovo] = useState({
    componente: "",
    unidade: "job",
    qtd: "1",
    preco: "",
    repasse: "",
  });

  const load = async () => {
    if (!proposalId) return;
    setLoading(true);
    const [{ data: prop }, { data: its }] = await Promise.all([
      supabase
        .from("proposals")
        .select("pricing_status, ai_review, ai_review_at, transcricao, notas")
        .eq("id", proposalId)
        .maybeSingle(),
      supabase.from("proposal_items").select("*").eq("proposal_id", proposalId).order("grupo"),
    ]);
    const p = prop as {
      pricing_status: PricingStatus;
      ai_review: AiReview | null;
      ai_review_at: string | null;
      transcricao: string | null;
      notas: string | null;
    } | null;
    setStatus(p?.pricing_status ?? "auto");
    setReview(p?.ai_review ?? null);
    setReviewAt(p?.ai_review_at ?? null);
    setTemTranscricao(!!(p?.transcricao ?? p?.notas)?.trim());

    const lista = (its as ProposalItem[]) ?? [];
    setItens(lista);
    setDraft(
      Object.fromEntries(
        lista.map((i) => [
          i.id,
          {
            quantidade: String(i.quantidade),
            preco: String(i.preco_cliente_unit),
            repasse: String(i.repasse_unit),
          },
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (open && proposalId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposalId]);

  // Totais ao vivo, direto do que esta digitado — o closer ve a margem mudar
  // antes de salvar, que e o ponto de ter uma aba de pricing.
  const totais = useMemo(() => {
    let cli = 0;
    let rep = 0;
    for (const i of itens) {
      const d = draft[i.id];
      const q = Number(d?.quantidade ?? i.quantidade) || 0;
      const p = Number(d?.preco ?? i.preco_cliente_unit) || 0;
      const r = Number(d?.repasse ?? i.repasse_unit) || 0;
      cli += q * p;
      rep += q * r;
    }
    return { cli, rep, margem: cli - rep, pct: cli > 0 ? ((cli - rep) / cli) * 100 : 0 };
  }, [itens, draft]);

  const set = (id: string, campo: keyof Draft, v: string) =>
    setDraft((p) => ({ ...p, [id]: { ...p[id], [campo]: v } }));

  const salvar = async () => {
    if (!proposalId) return;
    setSalvando(true);
    const payload = itens.map((i) => ({
      id: i.id,
      quantidade: Number(draft[i.id]?.quantidade ?? i.quantidade) || 0,
      preco_cliente_unit: Number(draft[i.id]?.preco ?? i.preco_cliente_unit) || 0,
      repasse_unit: Number(draft[i.id]?.repasse ?? i.repasse_unit) || 0,
    }));
    const { error } = await supabase.rpc("rpc_salvar_pricing", {
      p_proposal_id: proposalId,
      p_itens: payload,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Pricing saved");
    await load();
    onChanged();
  };

  const aprovar = async () => {
    if (!proposalId) return;
    setSalvando(true);
    // Salva o que esta na tela antes de carimbar — aprovar um numero que o
    // closer nao viu gravado seria a pior forma de errar aqui.
    await salvar();
    const { error } = await supabase.rpc("rpc_aprovar_pricing", { p_proposal_id: proposalId });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Pricing approved · moved to Negotiation");
    await load();
    onChanged();
  };

  const resetar = async () => {
    if (!proposalId) return;
    if (!confirm("Discard the manual pricing and rebuild it from the engine?")) return;
    setSalvando(true);
    const { error } = await supabase.rpc("rpc_resetar_pricing", { p_proposal_id: proposalId });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Pricing rebuilt from the engine");
    await load();
    onChanged();
  };

  const adicionar = async () => {
    if (!proposalId || !novo.componente.trim()) return;
    const { error } = await supabase.rpc("rpc_adicionar_item_pricing", {
      p_proposal_id: proposalId,
      p_componente: novo.componente.trim(),
      p_unidade: novo.unidade.trim() || "job",
      p_quantidade: Number(novo.qtd) || 1,
      p_preco_cliente_unit: Number(novo.preco) || 0,
      p_repasse_unit: Number(novo.repasse) || 0,
    });
    if (error) return toast.error(error.message);
    setNovo({ componente: "", unidade: "job", qtd: "1", preco: "", repasse: "" });
    await load();
    onChanged();
  };

  const remover = async (id: string) => {
    const { error } = await supabase.rpc("rpc_remover_item_pricing", { p_item_id: id });
    if (error) return toast.error(error.message);
    await load();
    onChanged();
  };

  const revisar = async () => {
    if (!proposalId) return;
    setRevisando(true);
    try {
      const r = await callRevisarOrcamento(proposalId);
      setReview(r);
      setReviewAt(new Date().toISOString());
      toast.success("AI review done");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRevisando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            Pricing · {clienteNome}
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
              {PRICING_STATUS_LABEL[status]}
            </span>
          </DialogTitle>
          <DialogDescription>
            Review project prices, partner payout and margin before approving the quote.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <AiPanel
              review={review}
              reviewAt={reviewAt}
              temTranscricao={temTranscricao}
              revisando={revisando}
              onRevisar={revisar}
            />

            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead className="w-24 text-right">Qty</TableHead>
                    <TableHead className="w-28 text-right">Unit price</TableHead>
                    <TableHead className="w-28 text-right">Client</TableHead>
                    <TableHead className="w-28 text-right">Unit remit.</TableHead>
                    <TableHead className="w-28 text-right">Remittance</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {GRUPO_ORDER.map((g) => {
                    const linhas = itens.filter((i) => i.grupo === g);
                    if (!linhas.length) return null;
                    return (
                      <Fragment key={g}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell
                            colSpan={7}
                            className="py-1.5 text-xs font-semibold uppercase tracking-wide"
                          >
                            {GRUPO_LABEL[g]}
                          </TableCell>
                        </TableRow>
                        {linhas.map((i) => {
                          const d = draft[i.id] ?? {
                            quantidade: String(i.quantidade),
                            preco: String(i.preco_cliente_unit),
                            repasse: String(i.repasse_unit),
                          };
                          const q = Number(d.quantidade) || 0;
                          const semPreco = (Number(d.preco) || 0) === 0;
                          return (
                            <TableRow key={i.id} className={semPreco ? "bg-[#FFF8E8]" : undefined}>
                              <TableCell className="max-w-[260px]">
                                <span className="block truncate">{i.componente}</span>
                                <span className="text-xs text-muted-foreground">
                                  {i.unidade}
                                  {semPreco && " · needs a price"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Cell
                                  value={d.quantidade}
                                  disabled={!isRuche}
                                  onChange={(v) => set(i.id, "quantidade", v)}
                                />
                              </TableCell>
                              <TableCell>
                                <Cell
                                  value={d.preco}
                                  disabled={!isRuche}
                                  onChange={(v) => set(i.id, "preco", v)}
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(q * (Number(d.preco) || 0))}
                              </TableCell>
                              <TableCell>
                                <Cell
                                  value={d.repasse}
                                  disabled={!isRuche}
                                  onChange={(v) => set(i.id, "repasse", v)}
                                  title={
                                    i.repasse_teto > 0
                                      ? `Capped at ${money(i.repasse_teto)} by the engine`
                                      : undefined
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {money(q * (Number(d.repasse) || 0))}
                              </TableCell>
                              <TableCell className="text-right">
                                {isRuche && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => remover(i.id)}
                                    title="Remove line"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {itens.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No lines yet. Save the measurement to generate them.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {isRuche && (
              <div className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_6rem_5rem_7rem_7rem_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs">New line</Label>
                  <Input
                    placeholder="e.g. Living room — Painting"
                    value={novo.componente}
                    onChange={(e) => setNovo((p) => ({ ...p, componente: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    value={novo.unidade}
                    onChange={(e) => setNovo((p) => ({ ...p, unidade: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    value={novo.qtd}
                    onChange={(e) => setNovo((p) => ({ ...p, qtd: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit price</Label>
                  <Input
                    type="number"
                    value={novo.preco}
                    onChange={(e) => setNovo((p) => ({ ...p, preco: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Unit remit.</Label>
                  <Input
                    type="number"
                    value={novo.repasse}
                    onChange={(e) => setNovo((p) => ({ ...p, repasse: e.target.value }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={adicionar}
                  disabled={!novo.componente.trim()}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="shrink-0 border-t px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="font-semibold tabular-nums">{money(totais.cli)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remittance</p>
                <p className="font-semibold tabular-nums">{money(totais.rep)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ruche margin</p>
                <p className="font-semibold tabular-nums text-[#2C7A3F]">
                  {money(totais.margem)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {totais.pct.toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
            {isRuche ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={resetar} disabled={salvando || status === "auto"}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Reset to engine
                </Button>
                <Button variant="outline" onClick={salvar} disabled={salvando}>
                  {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
                <Button onClick={aprovar} disabled={salvando || totais.cli <= 0}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Read-only — pricing is adjusted and approved by Ruche.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Cell({
  value,
  disabled,
  title,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  title?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min={0}
      title={title}
      disabled={disabled}
      className="h-8 text-right tabular-nums"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function AiPanel({
  review,
  reviewAt,
  temTranscricao,
  revisando,
  onRevisar,
}: {
  review: AiReview | null;
  reviewAt: string | null;
  temTranscricao: boolean;
  revisando: boolean;
  onRevisar: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> AI review
          </p>
          <p className="text-xs text-muted-foreground">
            {reviewAt
              ? `Transcript vs. quote · ${new Date(reviewAt).toLocaleString("en-US")}`
              : "Compares the visit transcript against what was measured."}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRevisar}
          disabled={revisando || !temTranscricao}
        >
          {revisando ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {review ? "Run again" : "Run review"}
        </Button>
      </div>

      <div className="px-4 py-3">
        {!temTranscricao && (
          <p className="text-sm text-muted-foreground">
            No transcript on this quote yet. The partner pastes the conversation in the quote form.
          </p>
        )}
        {temTranscricao && !review && (
          <p className="text-sm text-muted-foreground">Not reviewed yet.</p>
        )}
        {review && (
          <div className="space-y-3">
            <p className="text-sm">{review.resumo}</p>
            {review.faltando.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#2C7A3F]">
                <CheckCircle2 className="h-4 w-4" /> Nothing missing against the transcript.
              </p>
            ) : (
              <ul className="space-y-2">
                {review.faltando.map((f, i) => {
                  const g = GRAVIDADE[f.gravidade] ?? GRAVIDADE.baixa;
                  return (
                    <li key={i} className="rounded-lg border p-3">
                      <p className="flex items-start gap-2 text-sm font-medium">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" />
                        <span className="flex-1">{f.o_que}</span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: g.bg, color: g.fg }}
                        >
                          {g.label}
                        </span>
                      </p>
                      <p className="mt-1.5 border-l-2 pl-2.5 text-xs italic text-muted-foreground">
                        “{f.evidencia}”
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {review.conferido.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Checked and present ({review.conferido.length})
                </summary>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                  {review.conferido.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
