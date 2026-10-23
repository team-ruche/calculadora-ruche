import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X, Loader2, Camera, Images, Mic, Square, ChevronDown } from "lucide-react";
import {
  supabase,
  callTranscreverAudio,
  rotuloServico,
  type MotorPrice,
  type NichoTemplate,
  type CampoTemplate,
} from "@/integrations/supabase/models";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

// Os extras do orcamento inteiro sairam da tela, mas continuam no tipo e no
// save: um orcamento antigo editado preserva o que ja tinha, em vez de zerar
// escondido. A unica excecao e aparelhos_mover, que agora e a SOMA das horas
// declaradas ambiente a ambiente.
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
  remocao: boolean;
  moverMoveis: boolean;
  moverMoveisHoras: number;
  servicos: string[];
  observacao: string;
  // Valores dos campos do template do nicho. No flooring espelha as colunas
  // antigas (piso_novo etc.), que o resto do sistema ainda le.
  campos: Record<string, unknown>;
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

// Piso atual e piso novo nascem EM BRANCO — o parceiro escolhe, nada vem
// pre-selecionado (um default silencioso ja virou preco errado antes).
// Os defaults do template precisam estar em `campos` desde o inicio: o
// checkbox ja aparece marcado, e o motor le `campos`, nao a tela. Sem semear,
// a tela diria "remove o piso" e o orcamento nao cobraria a remocao.
const camposIniciais = (t: NichoTemplate | null): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const c of t?.campos ?? []) {
    if (c.tipo === "bool") out[c.key] = c.default === true;
  }
  return out;
};

const emptyRoom = (t: NichoTemplate | null = null): RoomDraft => ({
  localId: crypto.randomUUID(),
  nome: "",
  areaSqft: 0,
  pisoNovo: "",
  pisoAtual: "",
  preparo: "nenhuma",
  remocao: true,
  moverMoveis: false,
  moverMoveisHoras: 0,
  servicos: [],
  observacao: "",
  campos: camposIniciais(t),
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
  const { user, empresaId } = useAuth();

  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [email, setEmail] = useState("");
  const [transcricao, setTranscricao] = useState("");
  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()]);
  const [extras, setExtras] = useState<ExtrasDraft>(emptyExtras());
  const [segundoAndar, setSegundoAndar] = useState(false);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [empresaAlvo, setEmpresaAlvo] = useState<string | null>(null);
  const [template, setTemplate] = useState<NichoTemplate | null>(null);
  // Opcoes de catalogo por grupo do motor, ja filtradas por empresa e nicho.
  const [catalogo, setCatalogo] = useState<Record<string, Opt[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      // Desde a etapa 23 motor_prices tem dono. Sem filtrar por empresa, um
      // usuario da Ruche (que a RLS nao limita) veria cada piso duas vezes:
      // o da empresa e o do catalogo modelo.
      const ctx = await resolverContexto(mode === "edit" ? proposalId : undefined, empresaId);
      const alvo = ctx.empresaId;
      setEmpresaAlvo(alvo);
      setTemplate(ctx.template);
      if (mode === "create") setRooms([emptyRoom(ctx.template)]);
      const { data } = await supabase
        .from("motor_prices")
        .select("*")
        .eq("ativo", true)
        .eq("empresa_id", alvo ?? "00000000-0000-0000-0000-000000000000")
        .eq("nicho", ctx.nicho ?? "flooring")
        .order("componente");
      const mp = (data as MotorPrice[]) ?? [];
      if (!alvo) {
        toast.error("Este orçamento não está ligado a nenhuma empresa — avise a Ruche.");
      }
      if (!ctx.template) {
        toast.error(`Nicho "${ctx.nicho ?? "?"}" não tem template — avise a Ruche.`);
      }
      // Um grupo do motor por conjunto de opcoes; o template diz qual campo
      // consome qual grupo.
      const porGrupo: Record<string, Opt[]> = {};
      for (const m of mp) {
        (porGrupo[m.grupo] ??= []).push({ value: m.codigo, label: m.componente });
      }
      setCatalogo(porGrupo);
      if (mode === "edit" && proposalId) await loadExisting(proposalId);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadExisting = async (pid: string) => {
    const { data: prop } = await supabase
      .from("proposals")
      .select("lead_id, notas, transcricao, leads(nome_cliente, telefone, endereco, email)")
      .eq("id", pid)
      .maybeSingle();
    const propRow = prop as {
      notas: string | null;
      transcricao: string | null;
      leads: {
        nome_cliente: string;
        telefone: string | null;
        endereco: string | null;
        email: string | null;
      } | null;
    } | null;
    const lead = propRow?.leads;
    if (lead) {
      setNomeCliente(lead.nome_cliente ?? "");
      setTelefone(lead.telefone ?? "");
      setEndereco(lead.endereco ?? "");
      setEmail(lead.email ?? "");
    }
    // Orcamento antigo: o que estava em notas vira o ponto de partida da
    // transcricao, para o texto nao sumir da tela.
    setTranscricao(propRow?.transcricao ?? propRow?.notas ?? "");

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
        remocao: boolean | null;
        mover_moveis: boolean | null;
        mover_moveis_horas: number | null;
        servicos: string[] | null;
        observacao: string | null;
        campos: Record<string, unknown> | null;
      }[]) ?? []
    ).map((r) => ({
      localId: crypto.randomUUID(),
      nome: r.nome,
      areaSqft: Number(r.area_sqft),
      pisoNovo: r.piso_novo ?? "",
      pisoAtual: r.piso_atual ?? "",
      preparo: r.preparo || "nenhuma",
      // null = sim: e assim que todo registro anterior foi cobrado.
      remocao: r.remocao ?? true,
      moverMoveis: r.mover_moveis ?? false,
      moverMoveisHoras: Number(r.mover_moveis_horas ?? 0),
      servicos: r.servicos ?? [],
      observacao: r.observacao ?? "",
      campos: (r.campos as Record<string, unknown>) ?? {},
      media: mediaByRoom[r.id] ?? [],
    }));
    setRooms(roomDrafts.length ? roomDrafts : [emptyRoom()]);

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

  const addRoom = () => setRooms((p) => [...p, emptyRoom(template)]);
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
          toast.error(`Failed to upload ${m.file.name}: ${upErr.message}`);
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
      return toast.error("Each room needs a name and an area greater than zero");
    }
    // As travas vem do template do nicho: obrigatorio, e campo dependente que
    // ficou visivel e vazio (marcou "remover o piso" e nao disse qual).
    const faltando = primeiroCampoFaltando(rooms, template);
    if (faltando) return toast.error(faltando);
    setSubmitting(true);

    let pid = proposalId ?? "";

    if (mode === "create") {
      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          partner_id: user.id,
          empresa_id: empresaAlvo,
          nome_cliente: nomeCliente,
          telefone: telefone || null,
          endereco: endereco || null,
          email: email || null,
        })
        .select()
        .single();
      if (leadErr || !lead) {
        setSubmitting(false);
        return toast.error(leadErr?.message ?? "Error creating lead");
      }
      const { data: prop, error: propErr } = await supabase
        .from("proposals")
        .insert({
          lead_id: lead.id,
          partner_id: user.id,
          empresa_id: empresaAlvo,
          status: "rascunho",
        })
        .select()
        .single();
      if (propErr || !prop) {
        setSubmitting(false);
        return toast.error(propErr?.message ?? "Error creating proposal");
      }
      pid = prop.id;
    } else {
      // edit: update lead, clear rooms/extras (cascade deletes media) and recreate
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
      // remove from storage the media the user deleted
      if (removedPaths.length) await supabase.storage.from("proposal-media").remove(removedPaths);
    }

    await supabase
      .from("proposals")
      .update({ transcricao: transcricao.trim() || null })
      .eq("id", pid);

    // (re)create rooms one by one to link the media to the room_id
    for (const r of rooms) {
      const { data: room, error: roomErr } = await supabase
        .from("proposal_rooms")
        .insert({
          proposal_id: pid,
          nome: r.nome,
          area_sqft: r.areaSqft,
          // campos e a fonte; as colunas viram espelho para o que ainda le
          // delas (ghl-sync, documento do orcamento, relatorios antigos).
          piso_novo: txt(r.campos.piso_novo),
          piso_atual: txt(r.campos.piso_atual),
          preparo: txt(r.campos.preparo) || "nenhuma",
          remocao: r.campos.remocao !== false,
          mover_moveis: r.campos.mover_moveis === true,
          mover_moveis_horas:
            r.campos.mover_moveis === true ? Number(r.campos.mover_moveis_horas ?? 0) : 0,
          campos: r.campos,
          servicos: r.servicos,
          observacao: r.observacao.trim() || null,
        })
        .select()
        .single();
      if (roomErr || !room) {
        setSubmitting(false);
        return toast.error(roomErr?.message ?? "Error saving room");
      }
      await uploadRoomMedia(pid, room.id, r.media);
    }

    // O motor continua lendo as horas de mover moveis de proposal_extras.
    // A conta agora nasce dos ambientes; o preco por hora e o mesmo.
    const horasMoveis = rooms.reduce(
      (a, r) => a + (r.campos.mover_moveis === true ? Number(r.campos.mover_moveis_horas) || 0 : 0),
      0,
    );
    const { error: exErr } = await supabase.from("proposal_extras").insert({
      proposal_id: pid,
      ...extras,
      aparelhos_mover: horasMoveis,
      segundo_andar_sem_elevador: segundoAndar,
    });
    if (exErr) {
      setSubmitting(false);
      return toast.error(exErr.message);
    }

    // Recalculo passa pelo wrapper: se o closer ja ajustou o pricing deste
    // orcamento, o motor nao volta por cima. Os servicos marcados por ambiente
    // entram como linha de preco zero, esperando o closer precificar.
    const { data: pricingStatus, error: calcErr } = await supabase.rpc("rpc_recalcular_se_auto", {
      p_proposal_id: pid,
    });
    if (calcErr) {
      toast.warning("Saved, but the calculation failed: " + calcErr.message);
    } else if (pricingStatus !== "auto") {
      toast.info("Saved. Pricing was already adjusted by Ruche, so it was left untouched.");
    } else {
      await supabase.rpc("rpc_seed_servicos", { p_proposal_id: pid });
      toast.success(mode === "create" ? "Quote created and priced" : "Quote updated");
    }

    setSubmitting(false);
    onSaved();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome-cliente">Name</Label>
              <Input
                id="nome-cliente"
                required
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Phone</Label>
              <Input
                id="telefone"
                type="tel"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endereco">Address</Label>
              <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <CardTitle>Rooms</CardTitle>
              <CardDescription>
                Everything is measured room by room: floors, furniture, extra services, notes and
                photos.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addRoom}>
              <Plus className="mr-1 h-4 w-4" /> Room
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {rooms.map((room, i) => (
              <RoomCard
                key={room.localId}
                room={room}
                index={i}
                canRemove={rooms.length > 1}
                template={template}
                catalogo={catalogo}
                onChange={(patch) => updateRoom(room.localId, patch)}
                onRemove={() => removeRoom(room.localId)}
                onFiles={(files) => addFiles(room.localId, files)}
                onRemoveMedia={(idx) => removeMedia(room.localId, idx)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Post-visit transcript</CardTitle>
            <CardDescription>
              Paste here the conversation with the client. The AI reads it against the quote and
              flags what the client asked for and is missing — a room, a service, a photo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-end">
              <DictateButton onText={(t) => setTranscricao((p) => (p ? p + " " + t : t))} />
            </div>
            <Textarea
              rows={8}
              placeholder="Paste the transcript of the visit, or use the mic to dictate…"
              value={transcricao}
              onChange={(e) => setTranscricao(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-6 py-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Create quote" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function RoomCard({
  room,
  index,
  canRemove,
  template,
  catalogo,
  onChange,
  onRemove,
  onFiles,
  onRemoveMedia,
}: {
  room: RoomDraft;
  index: number;
  canRemove: boolean;
  template: NichoTemplate | null;
  catalogo: Record<string, Opt[]>;
  onChange: (patch: Partial<RoomDraft>) => void;
  onRemove: () => void;
  onFiles: (files: FileList | null) => void;
  onRemoveMedia: (idx: number) => void;
}) {
  const rotuloArea = template?.rotulo_area ?? "Room";
  const servicoOpts: Opt[] = (template?.servicos ?? []).map((v) => ({
    value: v,
    label: rotuloServico(v),
  }));
  return (
    <details open className="group rounded-lg border p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
        <span>{room.nome.trim() || `${rotuloArea} ${index + 1}`}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {room.areaSqft || 0} {template?.unidade_base ?? "sqft"} · expand / collapse
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!canRemove}
            onClick={onRemove}
            title="Remove room"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{rotuloArea} name</Label>
            <Input
              required
              placeholder={`${rotuloArea} ${index + 1}`}
              value={room.nome}
              onChange={(e) => onChange({ nome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Area ({template?.unidade_base ?? "sqft"})</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              required
              value={room.areaSqft || ""}
              onChange={(e) => onChange({ areaSqft: Number(e.target.value) })}
            />
          </div>
        </div>

        <CamposDoTemplate
          campos={template?.campos ?? []}
          valores={room.campos}
          catalogo={catalogo}
          onChange={(key, valor) => onChange({ campos: { ...room.campos, [key]: valor } })}
        />

        <div className="space-y-2">
          <Label>Additional services</Label>
          <MultiSelect
            values={room.servicos}
            opts={servicoOpts}
            placeholder="None selected"
            onChange={(v) => onChange({ servicos: v })}
          />
          {room.servicos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {room.servicos.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
                >
                  {rotuloServico(s)}
                  <button
                    type="button"
                    onClick={() => onChange({ servicos: room.servicos.filter((x) => x !== s) })}
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Notes</Label>
            <DictateButton
              onText={(t) =>
                onChange({ observacao: room.observacao ? room.observacao + " " + t : t })
              }
            />
          </div>
          <Textarea
            rows={3}
            placeholder="What the client said about this room, access, anything odd…"
            value={room.observacao}
            onChange={(e) => onChange({ observacao: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Photos / videos</Label>
          <div className="flex flex-wrap gap-2">
            <PickerButton
              icon={<Camera className="mr-1.5 h-4 w-4" />}
              label="Camera"
              accept="image/*,video/*"
              capture="environment"
              onFiles={onFiles}
            />
            <PickerButton
              icon={<Images className="mr-1.5 h-4 w-4" />}
              label="Gallery"
              accept="image/*,video/*"
              multiple
              onFiles={onFiles}
            />
          </div>
          {room.media.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
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
                      onClick={() => onRemoveMedia(idx)}
                      className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

// Botao que abre a camera do celular ou a galeria. No desktop os dois caem no
// seletor de arquivos — `capture` e simplesmente ignorado la.
function PickerButton({
  icon,
  label,
  accept,
  capture,
  multiple,
  onFiles,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
      {icon}
      {label}
      <input
        type="file"
        className="sr-only"
        accept={accept}
        capture={capture}
        multiple={multiple}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function MultiSelect({
  values,
  opts,
  placeholder,
  onChange,
}: {
  values: string[];
  opts: Opt[];
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          role="combobox"
        >
          <span className={values.length ? "" : "text-muted-foreground"}>
            {values.length ? `${values.length} selected` : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-[--radix-popover-trigger-width] overflow-y-auto p-1"
      >
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Checkbox checked={values.includes(o.value)} className="pointer-events-none" />
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// --- Nota por voz ------------------------------------------------------
// Grava no navegador e manda para a Edge Function transcrever-audio (Whisper).
// A Web Speech API do navegador ficou pelo caminho: ela fala com o servidor do
// Google e morre com "network" em preview embutido, em Chromium sem as chaves
// dele e em navegador com shield — ou seja, justamente onde o parceiro usa.

const MAX_SEGUNDOS = 300;

function DictateButton({ onText }: { onText: (t: string) => void }) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [enviando, setEnviando] = useState(false);
  // True while awaiting getUserMedia — blocks double-clicks that would start
  // two recordings at once.
  const [iniciando, setIniciando] = useState(false);
  // Audio whose transcription failed — kept so it can be retried or downloaded.
  const [falhou, setFalhou] = useState<{ blob: Blob; mime: string; url: string } | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  const setFailed = (v: { blob: Blob; mime: string } | null) => {
    if (!mountedRef.current) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (!v) return setFalhou(null);
    const url = URL.createObjectURL(v.blob);
    urlRef.current = url;
    setFalhou({ ...v, url });
  };

  // Track mount state (reset on mount for React StrictMode double-effects) and
  // release the mic and object URLs on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recRef.current?.state === "recording") recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // Corta sozinho no limite: audio longo demais e recusado pela API.
  useEffect(() => {
    if (segundos >= MAX_SEGUNDOS && recRef.current?.state === "recording") {
      recRef.current.stop();
      toast.info("Recording stopped at 5 minutes.");
    }
  }, [segundos]);

  const transcrever = async (blob: Blob, mime: string) => {
    if (!mountedRef.current) return;
    setEnviando(true);
    try {
      const texto = await callTranscreverAudio(blob, mime);
      if (!mountedRef.current) return;
      cbRef.current(texto);
      setFailed(null);
      toast.success("Transcribed");
    } catch (e) {
      if (!mountedRef.current) return;
      setFailed({ blob, mime });
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setEnviando(false);
    }
  };

  const iniciar = async () => {
    if (iniciando || falhou) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return toast.error("This browser cannot record audio. Type the note instead.");
    }
    setIniciando(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (mountedRef.current) {
        setIniciando(false);
        toast.error("Microphone blocked. Allow it for this site and try again.");
      }
      return;
    }
    // Unmounted while waiting for the mic permission: release it and bail.
    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIniciando(false);
      return toast.error("This browser cannot record audio. Type the note instead.");
    }
    const pedacos: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recRef.current = null;
      // Fired async — possibly after unmount (e.g. cleanup stopped the
      // recorder). Never touch state or create object URLs when unmounted.
      if (!mountedRef.current) return;
      setGravando(false);
      setSegundos(0);
      const mime = rec.mimeType || "audio/webm";
      const blob = new Blob(pedacos, { type: mime });
      if (blob.size < 1000) return toast.error("Recording too short.");
      void transcrever(blob, mime);
    };
    try {
      rec.start();
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setIniciando(false);
      return toast.error("Could not start recording. Try again.");
    }
    recRef.current = rec;
    setSegundos(0);
    setIniciando(false);
    setGravando(true);
  };

  const parar = () => recRef.current?.stop();

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
  const ext = (falhou?.mime.split(";")[0].split("/")[1] ?? "webm").replace("mpeg", "mp3");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {falhou && !gravando && (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={enviando}
            onClick={() => transcrever(falhou.blob, falhou.mime)}
          >
            Retry transcription
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild>
            <a href={falhou.url} download={`voice-note.${ext}`}>
              Download audio
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={enviando}
            onClick={() => setFailed(null)}
          >
            Discard audio
          </Button>
          <span className="text-xs text-muted-foreground">
            Recording kept only while this form is open. Download it before leaving.
          </span>
        </>
      )}
      <Button
        type="button"
        size="sm"
        variant={gravando ? "destructive" : "ghost"}
        disabled={enviando || iniciando || (!!falhou && !gravando)}
        onClick={gravando ? parar : iniciar}
        title="Record a voice note — it gets transcribed into the field"
      >
        {enviando ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Transcribing…
          </>
        ) : iniciando ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Starting…
          </>
        ) : gravando ? (
          <>
            <Square className="mr-1.5 h-3.5 w-3.5 fill-current" /> Stop · {mmss}
          </>
        ) : (
          <>
            <Mic className="mr-1.5 h-4 w-4" /> Record
          </>
        )}
      </Button>
    </div>
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
        <SelectValue placeholder="Select" />
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

// Empresa e nicho deste orcamento, e o template do nicho. A empresa vem do
// proprio orcamento (edicao), do usuario logado (parceiro) ou, para a Ruche
// criando orcamento, da unica empresa ativa — enquanto houver so uma, nao faz
// sentido perguntar.
async function resolverContexto(
  proposalId: string | undefined,
  empresaIdDoUsuario: string | null,
): Promise<{ empresaId: string | null; nicho: string | null; template: NichoTemplate | null }> {
  let empresa: string | null = null;
  let nicho: string | null = null;

  if (proposalId) {
    const { data } = await supabase
      .from("proposals")
      .select("empresa_id, nicho")
      .eq("id", proposalId)
      .maybeSingle();
    const row = data as { empresa_id: string | null; nicho: string | null } | null;
    empresa = row?.empresa_id ?? null;
    nicho = row?.nicho ?? null;
  }
  if (!empresa) empresa = empresaIdDoUsuario;
  if (!empresa) {
    const { data: es } = await supabase.from("empresas").select("id").eq("ativo", true).limit(2);
    const lista = (es as { id: string }[]) ?? [];
    if (lista.length === 1) empresa = lista[0].id;
  }
  if (!nicho && empresa) {
    const { data: e } = await supabase
      .from("empresas")
      .select("nicho")
      .eq("id", empresa)
      .maybeSingle();
    nicho = (e as { nicho: string } | null)?.nicho ?? null;
  }

  let template: NichoTemplate | null = null;
  if (nicho) {
    const { data: t } = await supabase
      .from("nicho_templates")
      .select("*")
      .eq("nicho", nicho)
      .eq("ativo", true)
      .maybeSingle();
    template = (t as NichoTemplate) ?? null;
  }
  return { empresaId: empresa, nicho, template };
}

// Desenha os campos que o template do nicho declara. Campo sem grupo e so
// medida: aparece na tela e nao vira linha de preco.
function CamposDoTemplate({
  campos,
  valores,
  catalogo,
  onChange,
}: {
  campos: CampoTemplate[];
  valores: Record<string, unknown>;
  catalogo: Record<string, Opt[]>;
  onChange: (key: string, valor: unknown) => void;
}) {
  const visivel = (c: CampoTemplate) => !c.depende_de || valores[c.depende_de] === true;

  const selects = campos.filter((c) => c.tipo === "catalogo" && visivel(c));
  const numeros = campos.filter((c) => c.tipo === "numero" && visivel(c));
  const bools = campos.filter((c) => c.tipo === "bool");
  const textos = campos.filter((c) => c.tipo === "texto" && visivel(c));

  return (
    <div className="space-y-3">
      {selects.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {selects.map((c) => (
            <div key={c.key} className="space-y-2">
              <Label>{c.label}</Label>
              <RoomSelect
                value={String(valores[c.key] ?? "")}
                opts={catalogo[c.grupo ?? ""] ?? []}
                onChange={(v) => onChange(c.key, v)}
              />
              {c.ajuda && <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
            </div>
          ))}
        </div>
      )}

      {bools.map((c) => (
        <label key={c.key} className="flex items-start gap-2.5">
          <Checkbox
            className="mt-0.5"
            checked={(valores[c.key] ?? c.default ?? false) === true}
            onCheckedChange={(v) => onChange(c.key, v === true)}
          />
          <span className="text-sm leading-tight">
            {c.label}
            {c.ajuda && <span className="block text-xs text-muted-foreground">{c.ajuda}</span>}
          </span>
        </label>
      ))}

      {numeros.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {numeros.map((c) => (
            <div key={c.key} className="space-y-2">
              <Label>{c.label}</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={(valores[c.key] as number) || ""}
                onChange={(e) => onChange(c.key, Number(e.target.value))}
              />
              {c.ajuda && <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
            </div>
          ))}
        </div>
      )}

      {textos.map((c) => (
        <div key={c.key} className="space-y-2">
          <Label>{c.label}</Label>
          <Input
            value={String(valores[c.key] ?? "")}
            onChange={(e) => onChange(c.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));

// Primeira trava violada, em linguagem de gente. Sai do template, entao nicho
// novo ganha validacao sem ninguem escrever if.
function primeiroCampoFaltando(rooms: RoomDraft[], template: NichoTemplate | null): string | null {
  if (!template) return null;
  for (const [i, r] of rooms.entries()) {
    const nome = r.nome.trim() || `${template.rotulo_area} ${i + 1}`;
    for (const c of template.campos) {
      const visivel = !c.depende_de || r.campos[c.depende_de] === true;
      if (!visivel) continue;
      const v = r.campos[c.key];
      const vazio = v === undefined || v === null || v === "" || v === 0;
      if (c.obrigatorio && vazio) {
        return `${nome}: preencha "${c.label}"`;
      }
      // Campo que so apareceu porque outro foi marcado precisa de valor —
      // marcar "remover o piso" e nao dizer qual nao cobra nada.
      if (c.depende_de && vazio) {
        return `${nome}: "${c.label}" ficou em branco`;
      }
    }
  }
  return null;
}
