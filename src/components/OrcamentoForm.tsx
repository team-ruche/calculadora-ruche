import { useEffect, useState } from "react";
import { Plus, Trash2, X, Loader2 } from "lucide-react";
import { supabase, type MotorPrice } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Opt = { value: string; label: string };

const EXTRA_FIELDS: { key: keyof ExtrasDraft; label: string; unit: string }[] = [
  { key: "degraus_escada", label: "Degraus de escada", unit: "un" },
  { key: "baseboard_instalar_ft", label: "Baseboard a instalar", unit: "linear ft" },
  { key: "baseboard_pintar_ft", label: "Baseboard a pintar", unit: "linear ft" },
  { key: "quarter_round_ft", label: "Quarter round", unit: "linear ft" },
  { key: "transicoes", label: "Transições", unit: "un" },
  { key: "ambientes_moveis", label: "Ambientes com móveis", unit: "un" },
  { key: "aparelhos_mover", label: "Aparelhos a mover", unit: "un" },
  { key: "portas_trim", label: "Portas para door trimming", unit: "un" },
];

interface ExtrasDraft {
  degraus_escada: number;
  baseboard_instalar_ft: number;
  baseboard_pintar_ft: number;
  quarter_round_ft: number;
  transicoes: number;
  ambientes_moveis: number;
  aparelhos_mover: number;
  portas_trim: number;
}

type ExistingMedia = {
  kind: "existing";
  id: string;
  url: string;
  path: string;
  mime: string | null;
};
type NewMedia = { kind: "new"; file: File; previewUrl: string };
type MediaItem = ExistingMedia | NewMedia;

interface RoomDraft {
  localId: string;
  nome: string;
  areaSqft: number;
  pisoNovo: string;
  pisoAtual: string;
  preparo: string;
  media: MediaItem[];
}

const emptyExtras = (): ExtrasDraft => ({
  degraus_escada: 0,
  baseboard_instalar_ft: 0,
  baseboard_pintar_ft: 0,
  quarter_round_ft: 0,
  transicoes: 0,
  ambientes_moveis: 0,
  aparelhos_mover: 0,
  portas_trim: 0,
});

const emptyRoom = (novo = "", atual = ""): RoomDraft => ({
  localId: crypto.randomUUID(),
  nome: "",
  areaSqft: 0,
  pisoNovo: novo,
  pisoAtual: atual,
  preparo: "nenhuma",
  media: [],
});

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_");

export function OrcamentoForm({
  mode,
  proposalId,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  proposalId?: string;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();

  const [pisoNovoOpts, setPisoNovoOpts] = useState<Opt[]>([]);
  const [pisoAtualOpts, setPisoAtualOpts] = useState<Opt[]>([]);
  const [prepOpts, setPrepOpts] = useState<Opt[]>([{ value: "nenhuma", label: "Nenhuma" }]);

  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [email, setEmail] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()]);
  const [extras, setExtras] = useState<ExtrasDraft>(emptyExtras());
  const [segundoAndar, setSegundoAndar] = useState(false);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("motor_prices")
        .select("*")
        .eq("ativo", true)
        .order("componente");
      const mp = (data as MotorPrice[]) ?? [];
      const novo = mp
        .filter((m) => m.grupo === "instalacao")
        .map((m) => ({ value: m.codigo, label: m.componente }));
      const atual = mp
        .filter((m) => m.grupo === "demolicao")
        .map((m) => ({ value: m.codigo, label: m.componente }));
      const prep = [
        { value: "nenhuma", label: "Nenhuma" },
        ...mp
          .filter((m) => m.grupo === "prep")
          .map((m) => ({ value: m.codigo, label: m.componente })),
      ];
      setPisoNovoOpts(novo);
      setPisoAtualOpts(atual);
      setPrepOpts(prep);

      if (mode === "edit" && proposalId) {
        await loadExisting(proposalId, novo[0]?.value ?? "", atual[0]?.value ?? "");
      } else {
        setRooms([emptyRoom(novo[0]?.value ?? "", atual[0]?.value ?? "")]);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadExisting = async (pid: string, defNovo: string, defAtual: string) => {
    const { data: prop } = await supabase
      .from("proposals")
      .select("lead_id, leads(nome_cliente, telefone, endereco, email)")
      .eq("id", pid)
      .maybeSingle();
    const lead = (
      prop as {
        leads: {
          nome_cliente: string;
          telefone: string | null;
          endereco: string | null;
          email: string | null;
        } | null;
      } | null
    )?.leads;
    if (lead) {
      setNomeCliente(lead.nome_cliente ?? "");
      setTelefone(lead.telefone ?? "");
      setEndereco(lead.endereco ?? "");
      setEmail(lead.email ?? "");
    }

    const { data: rms } = await supabase.from("proposal_rooms").select("*").eq("proposal_id", pid);
    const { data: media } = await supabase
      .from("proposal_room_media")
      .select("*")
      .eq("proposal_id", pid);
    const mediaByRoom: Record<string, ExistingMedia[]> = {};
    for (const m of (media as {
      id: string;
      room_id: string;
      url: string;
      path: string;
      mime: string | null;
    }[]) ?? []) {
      (mediaByRoom[m.room_id] ??= []).push({
        kind: "existing",
        id: m.id,
        url: m.url,
        path: m.path,
        mime: m.mime,
      });
    }
    const roomDrafts: RoomDraft[] = (
      (rms as {
        id: string;
        nome: string;
        area_sqft: number;
        piso_novo: string;
        piso_atual: string;
        preparo: string;
      }[]) ?? []
    ).map((r) => ({
      localId: crypto.randomUUID(),
      nome: r.nome,
      areaSqft: Number(r.area_sqft),
      pisoNovo: r.piso_novo || defNovo,
      pisoAtual: r.piso_atual || defAtual,
      preparo: r.preparo || "nenhuma",
      media: mediaByRoom[r.id] ?? [],
    }));
    setRooms(roomDrafts.length ? roomDrafts : [emptyRoom(defNovo, defAtual)]);

    const { data: ex } = await supabase
      .from("proposal_extras")
      .select("*")
      .eq("proposal_id", pid)
      .maybeSingle();
    if (ex) {
      const e = ex as ExtrasDraft & { segundo_andar_sem_elevador: boolean };
      setExtras({
        degraus_escada: e.degraus_escada,
        baseboard_instalar_ft: e.baseboard_instalar_ft,
        baseboard_pintar_ft: e.baseboard_pintar_ft,
        quarter_round_ft: e.quarter_round_ft,
        transicoes: e.transicoes,
        ambientes_moveis: e.ambientes_moveis,
        aparelhos_mover: e.aparelhos_mover,
        portas_trim: e.portas_trim,
      });
      setSegundoAndar(e.segundo_andar_sem_elevador);
    }
  };

  const addRoom = () =>
    setRooms((p) => [...p, emptyRoom(pisoNovoOpts[0]?.value ?? "", pisoAtualOpts[0]?.value ?? "")]);
  const removeRoom = (id: string) =>
    setRooms((p) => (p.length === 1 ? p : p.filter((r) => r.localId !== id)));
  const updateRoom = (id: string, patch: Partial<RoomDraft>) =>
    setRooms((p) => p.map((r) => (r.localId === id ? { ...r, ...patch } : r)));

  const addFiles = (roomId: string, files: FileList | null) => {
    if (!files) return;
    const items: NewMedia[] = Array.from(files).map((file) => ({
      kind: "new",
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setRooms((p) =>
      p.map((r) => (r.localId === roomId ? { ...r, media: [...r.media, ...items] } : r)),
    );
  };

  const removeMedia = (roomId: string, idx: number) =>
    setRooms((p) =>
      p.map((r) => {
        if (r.localId !== roomId) return r;
        const m = r.media[idx];
        if (m?.kind === "existing") setRemovedPaths((rp) => [...rp, m.path]);
        return { ...r, media: r.media.filter((_, i) => i !== idx) };
      }),
    );

  const uploadRoomMedia = async (pid: string, roomId: string, media: MediaItem[]) => {
    for (const m of media) {
      if (m.kind === "existing") {
        await supabase.from("proposal_room_media").insert({
          room_id: roomId,
          proposal_id: pid,
          url: m.url,
          path: m.path,
          mime: m.mime,
        });
      } else {
        const path = `${pid}/${roomId}/${crypto.randomUUID()}_${safeName(m.file.name)}`;
        const { error: upErr } = await supabase.storage.from("proposal-media").upload(path, m.file);
        if (upErr) {
          toast.error(`Falha no upload de ${m.file.name}: ${upErr.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from("proposal-media").getPublicUrl(path);
        await supabase.from("proposal_room_media").insert({
          room_id: roomId,
          proposal_id: pid,
          url: pub.publicUrl,
          path,
          mime: m.file.type,
        });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (rooms.some((r) => !r.nome.trim() || r.areaSqft <= 0)) {
      toast.error("Cada ambiente precisa de nome e área maior que zero");
      return;
    }
    setSubmitting(true);

    let pid = proposalId ?? "";

    if (mode === "create") {
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          partner_id: user.id,
          nome_cliente: nomeCliente,
          telefone: telefone || null,
          endereco: endereco || null,
          email: email || null,
        })
        .select()
        .single();
      if (leadErr || !lead) {
        setSubmitting(false);
        return toast.error(leadErr?.message ?? "Erro ao criar lead");
      }
      const { data: prop, error: propErr } = await supabase
        .from("proposals")
        .insert({ lead_id: lead.id, partner_id: user.id, status: "rascunho" })
        .select()
        .single();
      if (propErr || !prop) {
        setSubmitting(false);
        return toast.error(propErr?.message ?? "Erro ao criar proposta");
      }
      pid = prop.id;
    } else {
      // edit: atualiza lead, limpa rooms/extras (cascade apaga media) e recria
      const { data: prop } = await supabase
        .from("proposals")
        .select("lead_id")
        .eq("id", pid)
        .maybeSingle();
      const leadId = (prop as { lead_id: string } | null)?.lead_id;
      if (leadId) {
        await supabase
          .from("leads")
          .update({
            nome_cliente: nomeCliente,
            telefone: telefone || null,
            endereco: endereco || null,
            email: email || null,
          })
          .eq("id", leadId);
      }
      await supabase.from("proposal_rooms").delete().eq("proposal_id", pid);
      await supabase.from("proposal_extras").delete().eq("proposal_id", pid);
      // remove do storage as mídias que o usuário tirou
      if (removedPaths.length) await supabase.storage.from("proposal-media").remove(removedPaths);
    }

    // (re)cria ambientes um a um para vincular a mídia ao room_id
    for (const r of rooms) {
      const { data: room, error: roomErr } = await supabase
        .from("proposal_rooms")
        .insert({
          proposal_id: pid,
          nome: r.nome,
          area_sqft: r.areaSqft,
          piso_novo: r.pisoNovo,
          piso_atual: r.pisoAtual,
          preparo: r.preparo,
        })
        .select()
        .single();
      if (roomErr || !room) {
        setSubmitting(false);
        return toast.error(roomErr?.message ?? "Erro ao salvar ambiente");
      }
      await uploadRoomMedia(pid, room.id, r.media);
    }

    const { error: exErr } = await supabase.from("proposal_extras").insert({
      proposal_id: pid,
      ...extras,
      segundo_andar_sem_elevador: segundoAndar,
    });
    if (exErr) {
      setSubmitting(false);
      return toast.error(exErr.message);
    }

    const { error: calcErr } = await supabase.rpc("rpc_calcular_proposta", { p_proposal_id: pid });
    if (calcErr) toast.warning("Salvo, mas o cálculo falhou: " + calcErr.message);
    else
      toast.success(mode === "create" ? "Orçamento criado e precificado" : "Orçamento atualizado");

    setSubmitting(false);
    onSaved();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nome-cliente">Nome</Label>
            <Input
              id="nome-cliente"
              required
              value={nomeCliente}
              onChange={(e) => setNomeCliente(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone</Label>
            <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Ambientes</CardTitle>
            <CardDescription>Medição, tipo de piso e fotos/vídeos por cômodo</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRoom}>
            <Plus className="mr-1 h-4 w-4" /> Ambiente
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {rooms.map((room, i) => (
            <div key={room.localId} className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome do ambiente</Label>
                  <Input
                    required
                    placeholder={`Ambiente ${i + 1}`}
                    value={room.nome}
                    onChange={(e) => updateRoom(room.localId, { nome: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Área (sqft)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    required
                    value={room.areaSqft || ""}
                    onChange={(e) => updateRoom(room.localId, { areaSqft: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Piso novo</Label>
                  <RoomSelect
                    value={room.pisoNovo}
                    opts={pisoNovoOpts}
                    onChange={(v) => updateRoom(room.localId, { pisoNovo: v })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Piso atual</Label>
                  <RoomSelect
                    value={room.pisoAtual}
                    opts={pisoAtualOpts}
                    onChange={(v) => updateRoom(room.localId, { pisoAtual: v })}
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="w-56 space-y-2">
                  <Label>Preparação</Label>
                  <RoomSelect
                    value={room.preparo}
                    opts={prepOpts}
                    onChange={(v) => updateRoom(room.localId, { preparo: v })}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label>Fotos / vídeos</Label>
                  <Input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={(e) => {
                      addFiles(room.localId, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={rooms.length === 1}
                  onClick={() => removeRoom(room.localId)}
                  title="Remover ambiente"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {room.media.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {room.media.map((m, idx) => {
                    const url = m.kind === "existing" ? m.url : m.previewUrl;
                    const isVideo =
                      m.kind === "existing"
                        ? m.mime?.startsWith("video")
                        : m.file.type.startsWith("video");
                    return (
                      <div key={idx} className="relative h-20 w-20 overflow-hidden rounded border">
                        {isVideo ? (
                          <video src={url} className="h-full w-full object-cover" />
                        ) : (
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeMedia(room.localId, idx)}
                          className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                          title="Remover"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extras do projeto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {EXTRA_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>
                {field.label} <span className="text-muted-foreground">({field.unit})</span>
              </Label>
              <Input
                id={field.key}
                type="number"
                min={0}
                step={field.unit === "linear ft" ? "0.1" : "1"}
                value={extras[field.key] || ""}
                onChange={(e) => setExtras((p) => ({ ...p, [field.key]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="segundo-andar"
              checked={segundoAndar}
              onCheckedChange={(v) => setSegundoAndar(v === true)}
            />
            <Label htmlFor="segundo-andar" className="cursor-pointer">
              2º andar sem elevador
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : mode === "create" ? "Criar orçamento" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

function RoomSelect({
  value,
  opts,
  onChange,
}: {
  value: string;
  opts: Opt[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
