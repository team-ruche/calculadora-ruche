import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase, type OrcamentoLayout, defaultLayout } from "@/integrations/supabase/models";
import { OrcamentoDocPreview, type DocData, type DocGrupo } from "@/components/OrcamentoDocPreview";
import { GRUPO_LABEL, GRUPO_ORDER } from "@/components/OrcamentoView";

// Public route (no login) — the link goes to the "Quote Link" field in GHL.
// Protected only by the unpredictability of the proposal_id (uuid v4), like an
// "anyone with the link" link — the RPC never returns payout/margin/GHL ids.
export const Route = createFileRoute("/orcamento/$id")({
  head: () => ({ meta: [{ title: "Quote · Ruche" }] }),
  component: PublicOrcamento,
});

type PublicOrcData = {
  cliente_nome: string;
  cliente_contato: string | null;
  endereco: string | null;
  total_cliente: number | null;
  layout: OrcamentoLayout | null;
  items: {
    grupo: keyof typeof GRUPO_LABEL;
    componente: string;
    unidade: string;
    quantidade: number;
    preco_cliente_unit: number;
    subtotal_cliente: number;
  }[];
};

const money = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

function buildDocData(d: PublicOrcData): DocData {
  const grupos: DocGrupo[] = GRUPO_ORDER.map((g) => ({
    grupo: GRUPO_LABEL[g],
    itens: d.items
      .filter((i) => i.grupo === g)
      .map((i) => ({
        item: i.componente,
        qtd: `${i.quantidade} ${i.unidade}`,
        unit: money(i.preco_cliente_unit),
        subtotal: money(i.subtotal_cliente),
      })),
  })).filter((g) => g.itens.length > 0);

  return {
    clienteNome: d.cliente_nome || "Client",
    clienteContato: d.cliente_contato || "—",
    projetoEndereco: d.endereco || "—",
    escopo: d.endereco || "",
    grupos,
    total: money(d.total_cliente),
  };
}

function PublicOrcamento() {
  const { id } = Route.useParams();
  const [data, setData] = useState<PublicOrcData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rpcData, error } = await supabase.rpc("rpc_public_orcamento", {
        p_proposal_id: id,
      });
      if (cancelled) return;
      if (error || !rpcData) {
        setStatus("not_found");
        return;
      }
      setData(rpcData as PublicOrcData);
      setStatus("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (status === "loading") {
    return <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (status === "not_found" || !data || !data.items.length) {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        Quote not found or has no items yet.
      </p>
    );
  }

  const layout = data.layout ?? defaultLayout("");

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="overflow-hidden rounded-lg border">
        <OrcamentoDocPreview layout={layout} data={buildDocData(data)} />
      </div>
    </div>
  );
}
