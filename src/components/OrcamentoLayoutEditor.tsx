import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Loader2,
  RefreshCw,
  Check,
} from "lucide-react";
import {
  supabase,
  type OrcamentoLayout,
  type OrcSecao,
  defaultLayout,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrcamentoDocPreview } from "@/components/OrcamentoDocPreview";
import { toast } from "sonner";

export function OrcamentoLayoutEditor({
  partnerId,
  onBack,
}: {
  partnerId: string;
  onBack?: () => void;
}) {
  const [layout, setLayout] = useState<OrcamentoLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("partner_orcamento_layout")
        .select("*")
        .eq("partner_id", partnerId)
        .maybeSingle();
      setLayout((data as OrcamentoLayout) ?? defaultLayout(partnerId));
      setLoading(false);
    })();
  }, [partnerId]);

  if (loading || !layout) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;

  const L = layout;
  const setL = (patch: Partial<OrcamentoLayout>) => setLayout({ ...L, ...patch });
  const setSecoes = (secoes: OrcSecao[]) => setL({ secoes });

  const uploadLogo = async (file: File) => {
    const path = `${partnerId}/logo_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("partner-logos")
      .upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("partner-logos").getPublicUrl(path);
    setL({ logo_url: data.publicUrl });
  };

  const addCustom = () => {
    const id = `c${Date.now()}`;
    setSecoes([
      ...L.secoes,
      {
        id,
        tipo: "custom",
        label: "Nova seção",
        on: true,
        title: "Nova seção",
        body: "Escreva aqui…",
      },
    ]);
    setEditId(id);
  };

  const patchSecao = (id: string, patch: Partial<OrcSecao>) =>
    setSecoes(L.secoes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const delSecao = (id: string) => setSecoes(L.secoes.filter((s) => s.id !== id));

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const arr = [...L.secoes];
    const from = arr.findIndex((s) => s.id === dragId);
    const to = arr.findIndex((s) => s.id === targetId);
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    setSecoes(arr);
    setDragId(null);
  };

  const salvar = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("partner_orcamento_layout")
      .upsert({ ...L, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
  };

  const restaurar = () => {
    if (!confirm("Restaurar o layout padrão? As alterações não salvas serão perdidas.")) return;
    setLayout({ ...defaultLayout(partnerId), logo_url: L.logo_url });
  };

  const Fld = ({
    label,
    value,
    onChange,
    ph,
  }: {
    label: string;
    value: string | null;
    onChange: (v: string) => void;
    ph?: string;
  }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ph}
        className="h-9"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">Configuração do orçamento</h1>
            <p className="text-sm text-muted-foreground">Identidade visual e seções do documento</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={restaurar}>
            <RefreshCw className="mr-1 h-4 w-4" /> Restaurar padrão
          </Button>
          <Button size="sm" onClick={salvar} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* Editor */}
        <div className="max-h-[70vh] space-y-4 overflow-y-auto rounded-xl border bg-card p-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Marca
            </p>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                {L.logo_url ? (
                  <img src={L.logo_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">logo</span>
                )}
              </div>
              <Input
                type="file"
                accept="image/*"
                className="h-9 text-xs"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              />
            </div>
            <div className="space-y-2">
              <Fld label="Empresa" value={L.empresa} onChange={(v) => setL({ empresa: v })} />
              <Fld label="Slogan" value={L.slogan} onChange={(v) => setL({ slogan: v })} />
              <Fld
                label="Título do documento"
                value={L.titulo}
                onChange={(v) => setL({ titulo: v })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cor 1</Label>
                  <input
                    type="color"
                    value={L.cor1}
                    onChange={(e) => setL({ cor1: e.target.value })}
                    className="h-9 w-full rounded-md border"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cor 2</Label>
                  <input
                    type="color"
                    value={L.cor2}
                    onChange={(e) => setL({ cor2: e.target.value })}
                    className="h-9 w-full rounded-md border"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contato e licenças
            </p>
            <div className="space-y-2">
              <Fld label="Telefone" value={L.telefone} onChange={(v) => setL({ telefone: v })} />
              <Fld label="Site" value={L.site} onChange={(v) => setL({ site: v })} />
              <Fld label="Instagram" value={L.instagram} onChange={(v) => setL({ instagram: v })} />
              <Fld label="Endereço" value={L.endereco} onChange={(v) => setL({ endereco: v })} />
              <Fld label="E-mail" value={L.email} onChange={(v) => setL({ email: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Fld label="License" value={L.license} onChange={(v) => setL({ license: v })} />
                <Fld label="HIC" value={L.hic} onChange={(v) => setL({ hic: v })} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Seções
              </p>
              <Button variant="outline" size="sm" onClick={addCustom}>
                <Plus className="mr-1 h-4 w-4" /> Nova seção
              </Button>
            </div>
            <div className="space-y-1.5">
              {L.secoes.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(s.id)}
                  className={`rounded-lg border bg-background p-2 ${s.on ? "" : "opacity-60"}`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => patchSecao(s.id, { on: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate text-xs">
                      {s.tipo === "custom" ? s.title || s.label : s.label}
                      {s.tipo === "custom" && (
                        <span className="ml-1 text-[10px] text-muted-foreground">· custom</span>
                      )}
                    </span>
                    {s.tipo === "custom" && (
                      <button
                        type="button"
                        onClick={() => setEditId(editId === s.id ? null : s.id)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => delSecao(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {s.tipo === "custom" && editId === s.id && (
                    <div className="mt-2 space-y-1.5">
                      <Input
                        value={s.title ?? ""}
                        onChange={(e) =>
                          patchSecao(s.id, { title: e.target.value, label: e.target.value })
                        }
                        placeholder="Título"
                        className="h-8 text-xs"
                      />
                      <Textarea
                        rows={2}
                        value={s.body ?? ""}
                        onChange={(e) => patchSecao(s.id, { body: e.target.value })}
                        placeholder="Conteúdo"
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-2 text-xs text-muted-foreground">
            Preview do documento
          </div>
          <div className="overflow-hidden rounded-b-xl">
            <OrcamentoDocPreview layout={L} />
          </div>
        </div>
      </div>
    </div>
  );
}
