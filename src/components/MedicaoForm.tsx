import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase, type MedicaoData } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const emptyMedicao: MedicaoData = {
  sqft_real: null,
  piso_atual: null,
  subfloor: null,
  nivelamento_necessario: null,
  umidade_ok: null,
  observacoes: null,
};

interface Props {
  open: boolean;
  proposalId: string | null;
  initial?: MedicaoData | null;
  // Se definido, ao salvar a proposta também avança para esse estágio.
  advanceToStage?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

// Formulário de medição. É o gate para mover uma visita para Negociação:
// sem preenchê-lo o card não avança. Usado no card do Overview e na aba Orçamento.
export function MedicaoForm({
  open,
  proposalId,
  initial,
  advanceToStage,
  onOpenChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<MedicaoData>(emptyMedicao);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(initial ? { ...emptyMedicao, ...initial } : emptyMedicao);
  }, [initial, open]);

  const set = <K extends keyof MedicaoData>(key: K, value: MedicaoData[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    if (!proposalId) return;
    if (!draft.sqft_real || draft.sqft_real <= 0) {
      toast.error("Informe o sqft real medido.");
      return;
    }
    setSaving(true);
    const patch: Record<string, unknown> = {
      medicao: draft,
      medicao_preenchida: true,
      medicao_at: new Date().toISOString(),
    };
    if (advanceToStage) patch.stage = advanceToStage;

    const { error } = await supabase.from("proposals").update(patch).eq("id", proposalId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(advanceToStage ? "Medição salva · movido para Negociação" : "Medição salva");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Formulário de medição</DialogTitle>
          <DialogDescription>
            Obrigatório para mover a visita para Negociação. Confirme os dados medidos no local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sqft">Sqft real medido</Label>
              <Input
                id="sqft"
                type="number"
                min={0}
                value={draft.sqft_real ?? ""}
                onChange={(e) => set("sqft_real", e.target.value ? Number(e.target.value) : null)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="piso">Piso atual (predominante)</Label>
              <Input
                id="piso"
                value={draft.piso_atual ?? ""}
                onChange={(e) => set("piso_atual", e.target.value || null)}
                placeholder="ex.: carpete, tile"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subfloor">Subfloor / base</Label>
            <Input
              id="subfloor"
              value={draft.subfloor ?? ""}
              onChange={(e) => set("subfloor", e.target.value || null)}
              placeholder="ex.: concreto, plywood"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!draft.nivelamento_necessario}
                onCheckedChange={(v) => set("nivelamento_necessario", !!v)}
              />
              Precisa nivelamento
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!draft.umidade_ok}
                onCheckedChange={(v) => set("umidade_ok", !!v)}
              />
              Umidade OK
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações da medição</Label>
            <Textarea
              id="obs"
              rows={3}
              value={draft.observacoes ?? ""}
              onChange={(e) => set("observacoes", e.target.value || null)}
              placeholder="Divergências vs. discovery, acessos, detalhes do job…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {advanceToStage ? "Salvar e mover" : "Salvar medição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
