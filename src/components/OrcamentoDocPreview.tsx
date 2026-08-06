import type { OrcamentoLayout } from "@/integrations/supabase/models";

// Dados que variam por orçamento (no editor usamos exemplo; no documento real vêm do lead/proposta).
export type DocItem = { item: string; qtd: string; unit: string; subtotal: string };
export type DocGrupo = { grupo: string; itens: DocItem[] };
export type DocData = {
  clienteNome: string;
  clienteContato: string;
  projetoEndereco: string;
  escopo: string;
  grupos: DocGrupo[];
  total: string;
  fotoUrl?: string | null;
};

// Texto padrão dos termos (editável por parceiro na configuração).
export const DEFAULT_TERMOS =
  "Validade de 15 dias. 50% na assinatura, 50% na entrega. Garantia de 1 ano na instalação.";

export const SAMPLE_DATA: DocData = {
  clienteNome: "David Zig-Kreger",
  clienteContato: "(339) 933-0322 · Dzk100@gmail.com",
  projetoEndereco: "1 Mead Street, Somerville, MA",
  escopo: "Sala · 800 sqft · Laminado · Troca",
  grupos: [
    {
      grupo: "Instalação",
      itens: [{ item: "Sala — Laminado", qtd: "800 sqft", unit: "$3.50", subtotal: "$2,800.00" }],
    },
    {
      grupo: "Remoção",
      itens: [
        { item: "Sala — remover Laminado", qtd: "800 sqft", unit: "$1.00", subtotal: "$800.00" },
      ],
    },
    {
      grupo: "Preparação",
      itens: [
        { item: "Sala — Prep simples", qtd: "800 sqft", unit: "$1.70", subtotal: "$1,360.00" },
      ],
    },
  ],
  total: "$4,960.00",
};

// Renderiza o documento do orçamento a partir do layout do parceiro + dados.
export function OrcamentoDocPreview({
  layout,
  data = SAMPLE_DATA,
}: {
  layout: OrcamentoLayout;
  data?: DocData;
}) {
  const cor1 = layout.cor1 || "#1D9E75";
  const cor2 = layout.cor2 || "#1A1A1A";
  const empresa = layout.empresa || "Sua empresa";

  const Head = ({ t }: { t: string }) => (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: ".4px",
        color: cor1,
        fontWeight: 500,
        marginBottom: 4,
      }}
    >
      {t}
    </div>
  );

  const renderSecao = (s: OrcamentoLayout["secoes"][number]) => {
    if (!s.on) return null;
    if (s.tipo === "custom") {
      return (
        <div key={s.id} style={{ marginBottom: 12 }}>
          <Head t={s.title || s.label || "Seção"} />
          <div style={{ whiteSpace: "pre-wrap" }}>{s.body || ""}</div>
        </div>
      );
    }
    switch (s.id) {
      case "capa":
        return (
          <div key={s.id}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {layout.logo_url ? (
                  <img
                    src={layout.logo_url}
                    alt=""
                    style={{ height: 44, maxWidth: 130, objectFit: "contain" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: cor1,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 500,
                    }}
                  >
                    {empresa[0]}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: cor2 }}>{empresa}</div>
                  {layout.slogan && (
                    <div style={{ fontSize: 11, color: "#555" }}>{layout.slogan}</div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#555", textAlign: "right" }}>
                {layout.telefone && <div>{layout.telefone}</div>}
                {layout.site && <div>{layout.site}</div>}
                {layout.instagram && <div>@{layout.instagram}</div>}
                {layout.endereco && <div>{layout.endereco}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-end" }}>
                  {layout.license && (
                    <span
                      style={{
                        background: cor2,
                        color: "#fff",
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 5,
                      }}
                    >
                      License: {layout.license}
                    </span>
                  )}
                  {layout.hic && (
                    <span
                      style={{
                        background: cor2,
                        color: "#fff",
                        fontSize: 10,
                        padding: "2px 7px",
                        borderRadius: 5,
                      }}
                    >
                      HIC: {layout.hic}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ height: 3, background: cor1, margin: "8px 0 10px", borderRadius: 2 }} />
          </div>
        );
      case "titulo":
        return (
          <div
            key={s.id}
            style={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 500,
              color: cor2,
              borderBottom: `2px solid ${cor1}`,
              paddingBottom: 6,
              margin: "2px 0 12px",
            }}
          >
            {layout.titulo || "Orçamento"}
          </div>
        );
      case "partes":
        return (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 14,
              marginBottom: 12,
              fontSize: 11,
            }}
          >
            <div>
              <div style={{ fontWeight: 500, color: cor1, marginBottom: 2 }}>Cliente</div>
              {data.clienteNome}
              <br />
              {data.clienteContato}
            </div>
            <div>
              <div style={{ fontWeight: 500, color: cor1, marginBottom: 2 }}>
                Endereço do projeto
              </div>
              {data.projetoEndereco}
            </div>
          </div>
        );
      case "foto":
        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            {data.fotoUrl ? (
              <img
                src={data.fotoUrl}
                alt=""
                style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8 }}
              />
            ) : (
              <div
                style={{
                  height: 90,
                  background: "#eee",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#999",
                  fontSize: 11,
                }}
              >
                Foto do projeto
              </div>
            )}
          </div>
        );
      case "escopo":
        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <Head t="Escopo" />
            {data.escopo}
          </div>
        );
      case "itens":
        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <Head t="Itens e preços" />
            {data.grupos.map((g, gi) => (
              <div key={gi} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: cor1, marginBottom: 3 }}>
                  {g.grupo}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "#999", fontSize: 10 }}>
                      <td style={{ padding: "2px 0" }}>Item</td>
                      <td style={{ padding: "2px 0", textAlign: "right" }}>Qtd</td>
                      <td style={{ padding: "2px 0", textAlign: "right" }}>Unit</td>
                      <td style={{ padding: "2px 0", textAlign: "right" }}>Subtotal</td>
                    </tr>
                  </thead>
                  <tbody>
                    {g.itens.map((i, ii) => (
                      <tr key={ii} style={{ color: "#333", borderTop: "0.5px solid #eee" }}>
                        <td style={{ padding: "3px 0" }}>{i.item}</td>
                        <td style={{ padding: "3px 0", textAlign: "right" }}>{i.qtd}</td>
                        <td style={{ padding: "3px 0", textAlign: "right" }}>{i.unit}</td>
                        <td style={{ padding: "3px 0", textAlign: "right" }}>{i.subtotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div
              style={{
                textAlign: "right",
                fontWeight: 500,
                marginTop: 6,
                borderTop: `1px solid #ddd`,
                paddingTop: 6,
              }}
            >
              Valor da proposta: {data.total}
            </div>
          </div>
        );
      case "termos":
        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <Head t="Termos e condições" />
            <div style={{ whiteSpace: "pre-wrap" }}>{s.body || DEFAULT_TERMOS}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: "16px 18px", fontSize: 12, color: "#1a1a1a", background: "#fff" }}>
      {layout.secoes.map(renderSecao)}
    </div>
  );
}
