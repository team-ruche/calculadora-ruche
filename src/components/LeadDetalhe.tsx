import type { LeadQualificacao } from "@/integrations/supabase/models";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type LeadLike = {
  nome_cliente: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  qualificacao: LeadQualificacao | null;
} | null;

const yn = (v: boolean | undefined) => (v === undefined ? undefined : v ? "Sim" : "Não");

// Card do formulário do Setter — grupos A a F (discovery GHL). Reutilizado no
// Overview (kanban/calendário) e na aba Orçamentos.
export function LeadDetalhe({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadLike;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const q = lead?.qualificacao ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead?.nome_cliente ?? "Detalhes do lead"}</DialogTitle>
          <DialogDescription>
            Discovery do setter — grupos A a F (formulário GHL).
          </DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            <Section title="A · Contato">
              <Field label="Nome completo" value={q?.a_nome ?? lead.nome_cliente} />
              <Field label="Telefone validado" value={q?.a_telefone ?? lead.telefone} />
              <Field label="E-mail" value={q?.a_email ?? lead.email} />
              <Field label="Endereço + ZIP" value={q?.a_endereco ?? lead.endereco} />
              <Field label="Fonte do lead" value={q?.a_fonte} />
            </Section>

            <Section title="B · Elegibilidade">
              <Field label="É dono do imóvel?" value={yn(q?.b_dono)} />
              <Field label="ZIP na área do parceiro?" value={yn(q?.b_zip_area)} />
              <Field label="Tipo de imóvel" value={q?.b_tipo_imovel} />
              <Field label="Sqft estimado" value={q?.b_sqft_estimado} />
            </Section>

            <Section title="C · Motivação">
              <Field label="Por que trocar agora" value={q?.c_motivo} />
              <Field label="Parte de reforma maior?" value={yn(q?.c_reforma_maior)} />
              <Field label="Quem mora na casa" value={q?.c_quem_mora} />
              <Field label="Data-limite" value={q?.c_data_limite} />
            </Section>

            <Section title="D · Escopo">
              <Field label="Ambientes" value={(q?.d_ambientes ?? []).join(", ")} />
              <Field label="Sqft total" value={q?.d_sqft_total} />
              <Field label="Piso atual" value={q?.d_piso_atual} />
              <Field label="Piso desejado" value={q?.d_piso_desejado} />
              <Field label="Material comprado" value={q?.d_material_comprado} />
              <Field label="Cor / estilo" value={q?.d_cor_estilo} />
              <Field label="Serviço" value={q?.d_servico} />
            </Section>

            <Section title="E · Dinheiro e concorrência">
              <Field label="Faixa de budget" value={q?.e_budget} />
              <Field label="Forma de pagamento" value={q?.e_pagamento} />
              <Field label="Outros orçamentos" value={q?.e_outros_orcamentos} />
            </Section>

            <Section title="F · Decisão e agendamento">
              <Field label="Decisores" value={q?.f_decisores} />
              <Field label="Decisores confirmados" value={yn(q?.f_decisores_confirmados)} />
              <Field
                label="Temperatura do lead"
                value={q?.f_temperatura ? `${q.f_temperatura}/5` : undefined}
              />
              <Field label="Observações" value={q?.f_observacoes} full />
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string | number | null | undefined;
  full?: boolean;
}) {
  const shown = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="min-h-9 rounded-md border bg-background px-3 py-2 text-sm text-foreground">
        {shown}
      </div>
    </div>
  );
}
