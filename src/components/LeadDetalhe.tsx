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

const yn = (v: boolean | undefined) => (v === undefined ? undefined : v ? "Yes" : "No");

// Setter form card — groups A to F (GHL discovery). Reused in the
// Overview (kanban/calendar) and the Quotes tab.
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
      <DialogContent className="flex max-h-[88dvh] max-w-3xl flex-col gap-0 overflow-y-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle>{lead?.nome_cliente ?? "Lead details"}</DialogTitle>
          <DialogDescription>Contact information and project details.</DialogDescription>
        </DialogHeader>

        {lead && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <Section title="A · Contact">
              <Field label="Full name" value={q?.a_nome ?? lead.nome_cliente} />
              <Field label="Validated phone" value={q?.a_telefone ?? lead.telefone} />
              <Field label="Email" value={q?.a_email ?? lead.email} />
              <Field label="Address + ZIP" value={q?.a_endereco ?? lead.endereco} />
              <Field label="Lead source" value={q?.a_fonte} />
            </Section>

            <Section title="B · Eligibility">
              <Field label="Owns the property?" value={yn(q?.b_dono)} />
              <Field label="ZIP in partner's area?" value={yn(q?.b_zip_area)} />
              <Field label="Property type" value={q?.b_tipo_imovel} />
              <Field label="Estimated sqft" value={q?.b_sqft_estimado} />
            </Section>

            <Section title="C · Motivation">
              <Field label="Why change now" value={q?.c_motivo} />
              <Field label="Part of larger remodel?" value={yn(q?.c_reforma_maior)} />
              <Field label="Who lives in the home" value={q?.c_quem_mora} />
              <Field label="Deadline" value={q?.c_data_limite} />
            </Section>

            <Section title="D · Scope">
              <Field label="Rooms" value={(q?.d_ambientes ?? []).join(", ")} />
              <Field label="Total sqft" value={q?.d_sqft_total} />
              <Field label="Current floor" value={q?.d_piso_atual} />
              <Field label="Desired floor" value={q?.d_piso_desejado} />
              <Field label="Material purchased" value={q?.d_material_comprado} />
              <Field label="Color / style" value={q?.d_cor_estilo} />
              <Field label="Service" value={q?.d_servico} />
            </Section>

            <Section title="E · Money and competition">
              <Field label="Budget range" value={q?.e_budget} />
              <Field label="Payment method" value={q?.e_pagamento} />
              <Field label="Other quotes" value={q?.e_outros_orcamentos} />
            </Section>

            <Section title="F · Decision and scheduling">
              <Field label="Decision-makers" value={q?.f_decisores} />
              <Field label="Decision-makers confirmed" value={yn(q?.f_decisores_confirmados)} />
              <Field
                label="Lead temperature"
                value={q?.f_temperatura ? `${q.f_temperatura}/5` : undefined}
              />
              <Field
                label="Preferred channel + SMS consent"
                value={(q?.f_canal_sms ?? []).join(", ")}
              />
              <Field label="Notes" value={q?.f_observacoes} full />
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
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-ink">{title}</p>
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
      <div className="break-words text-sm font-medium text-foreground">{shown}</div>
    </div>
  );
}
