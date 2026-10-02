import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X, Loader2, Camera, Images, Mic, Square, ChevronDown } from "lucide-react";
import { supabase, callTranscreverAudio, type MotorPrice } from "@/integrations/supabase/models";
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

// Servicos extras que o parceiro pode marcar por ambiente. Ainda sem preco:
// quem precifica e a aba de pricing do proprio orcamento, na aprovacao.
const SERVICOS: Opt[] = [
  { value: "painting", label: "Painting" },
  { value: "ceiling_repair", label: "Ceiling repair" },
  { value: "drywall_repair", label: "Drywall repair" },
  { value: "baseboard_install", label: "Baseboard installation" },
  { value: "baseboard_paint", label: "Baseboard painting" },
  { value: "quarter_round", label: "Quarter round" },
  { value: "transitions", label: "Floor transitions" },
  { value: "stair_steps", label: "Stairs / steps" },
  { value: "door_trim", label: "Door trim / undercut" },
  { value: "subfloor_repair", label: "Subfloor repair" },
  { value: "moisture_barrier", label: "Moisture barrier / underlayment" },
  { value: "debris_haul", label: "Debris haul-away" },
];
const SERVICO_LABEL: Record<string, string> = Object.fromEntries(
  SERVICOS.map((s) => [s.value, s.label]),
);

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
const emptyRoom = (): RoomDraft => ({
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
  const [prepOpts, setPrepOpts] = useState<Opt[]>([{ value: "nenhuma", label: "None" }]);

  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [email, setEmail] = useState("");
  const [transcricao, setTranscricao] = useState("");
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
      setPisoNovoOpts(
        mp
          .filter((m) => m.grupo === "instalacao")
          .map((m) => ({ value: m.codigo, label: m.componente })),
      );
      setPisoAtualOpts(
        mp
          .filter((m) => m.grupo === "demolicao")
          .map((m) => ({ value: m.codigo, label: m.componente })),
      );
      setPrepOpts([
        { value: "nenhuma", label: "None" },
        ...mp
          .filter((m) => m.grupo === "prep")
          .map((m) => ({ value: m.codigo, label: m.componente })),
      ]);

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

  const addRoom = () => setRooms((p) => [...p, emptyRoom()]);
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
    if (rooms.some((r) => !r.pisoNovo)) {
      return toast.error("Pick the new floor for every room");
    }
    // Sem piso atual nao da para cobrar a remocao — ou escolhe, ou desmarca.
    if (rooms.some((r) => r.remocao && !r.pisoAtual)) {
      return toast.error(
        "Pick the current floor, or uncheck “Remove current floor” when the new floor goes on top",
      );
    }
    if (rooms.some((r) => r.moverMoveis && r.moverMoveisHoras <= 0)) {
      return toast.error("Furniture to move needs the estimated hours");
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
        return toast.error(leadErr?.message ?? "Error creating lead");
      }
      const { data: prop, error: propErr } = await supabase
        .from("proposals")
        .insert({ lead_id: lead.id, partner_id: user.id, status: "rascunho" })
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
          piso_novo: r.pisoNovo,
          piso_atual: r.pisoAtual,
          preparo: r.preparo,
          remocao: r.remocao,
          mover_moveis: r.moverMoveis,
          mover_moveis_horas: r.moverMoveis ? r.moverMoveisHoras : 0,
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
      (a, r) => a + (r.moverMoveis ? Number(r.moverMoveisHoras) || 0 : 0),
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
                pisoNovoOpts={pisoNovoOpts}
                pisoAtualOpts={pisoAtualOpts}
                prepOpts={prepOpts}
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
  pisoNovoOpts,
  pisoAtualOpts,
  prepOpts,
  onChange,
  onRemove,
  onFiles,
  onRemoveMedia,
}: {
  room: RoomDraft;
  index: number;
  canRemove: boolean;
  pisoNovoOpts: Opt[];
  pisoAtualOpts: Opt[];
  prepOpts: Opt[];
  onChange: (patch: Partial<RoomDraft>) => void;
  onRemove: () => void;
  onFiles: (files: FileList | null) => void;
  onRemoveMedia: (idx: number) => void;
}) {
  return (
    <details open className="group rounded-lg border p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
        <span>{room.nome.trim() || `Room ${index + 1}`}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {room.areaSqft || 0} sqft · expand / collapse
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

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Room name</Label>
            <Input
              required
              placeholder={`Room ${index + 1}`}
              value={room.nome}
              onChange={(e) => onChange({ nome: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Area (sqft)</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              required
              value={room.areaSqft || ""}
              onChange={(e) => onChange({ areaSqft: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Prep</Label>
            <RoomSelect
              value={room.preparo}
              opts={prepOpts}
              onChange={(v) => onChange({ preparo: v })}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Current floor</Label>
            <RoomSelect
              value={room.pisoAtual}
              opts={pisoAtualOpts}
              onChange={(v) => onChange({ pisoAtual: v })}
            />
          </div>
          <div className="space-y-2">
            <Label>New floor</Label>
            <RoomSelect
              value={room.pisoNovo}
              opts={pisoNovoOpts}
              onChange={(v) => onChange({ pisoNovo: v })}
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5">
          <Checkbox
            className="mt-0.5"
            checked={room.remocao}
            onCheckedChange={(c) => onChange({ remocao: c === true })}
          />
          <span className="text-sm leading-tight">
            Remove the current floor
            <span className="block text-xs text-muted-foreground">
              Uncheck when the new floor is installed over the existing one — no removal is charged.
            </span>
          </span>
        </label>

        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <label className="flex items-center gap-2.5">
            <Checkbox
              checked={room.moverMoveis}
              onCheckedChange={(c) =>
                onChange({
                  moverMoveis: c === true,
                  ...(c === true ? {} : { moverMoveisHoras: 0 }),
                })
              }
            />
            <span className="text-sm">Furniture to move</span>
          </label>
          {room.moverMoveis && (
            <div className="space-y-2">
              <Label>Estimated hours</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                className="max-w-40"
                value={room.moverMoveisHoras || ""}
                onChange={(e) => onChange({ moverMoveisHoras: Number(e.target.value) })}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Additional services</Label>
          <MultiSelect
            values={room.servicos}
            opts={SERVICOS}
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
                  {SERVICO_LABEL[s] ?? s}
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
  const recRef = useRef<MediaRecorder | null>(null);
  const cbRef = useRef(onText);
  cbRef.current = onText;

  // Fecha o microfone se o formulario sumir no meio da gravacao.
  useEffect(
    () => () => {
      if (recRef.current?.state === "recording") recRef.current.stop();
    },
    [],
  );

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  // Corta sozinho no limite: audio longo demais e recusado pela API, e
  // descobrir isso depois de cinco minutos falando seria cruel.
  useEffect(() => {
    if (segundos >= MAX_SEGUNDOS && recRef.current?.state === "recording") {
      recRef.current.stop();
      toast.info("Recording stopped at 5 minutes.");
    }
  }, [segundos]);

  const iniciar = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return toast.error("This browser cannot record audio. Type the note instead.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast.error("Microphone blocked. Allow it for this site and try again.");
    }

    const rec = new MediaRecorder(stream);
    const pedacos: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) pedacos.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setGravando(false);
      setSegundos(0);
      const mime = rec.mimeType || "audio/webm";
      const blob = new Blob(pedacos, { type: mime });
      if (blob.size < 1000) return toast.error("Recording too short.");
      setEnviando(true);
      try {
        const texto = await callTranscreverAudio(blob, mime);
        cbRef.current(texto);
        toast.success("Transcribed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setEnviando(false);
      }
    };
    rec.start();
    recRef.current = rec;
    setSegundos(0);
    setGravando(true);
  };

  const parar = () => recRef.current?.stop();

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <Button
      type="button"
      size="sm"
      variant={gravando ? "destructive" : "ghost"}
      disabled={enviando}
      onClick={gravando ? parar : iniciar}
      title="Record a voice note — it gets transcribed into the field"
    >
      {enviando ? (
        <>
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Transcribing…
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
