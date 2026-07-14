import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase, type PisoTipo, type PreparoNivel } from "@/integrations/supabase/client";
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

export const Route = createFileRoute("/_authenticated/input")({
  head: () => ({ meta: [{ title: "Novo Orçamento · Ruche" }] }),
  component: InputPage,
});

const PISO_NOVO_OPTIONS: { value: PisoTipo; label: string }[] = [
  { value: "vinyl_lvp", label: "Vinyl/LVP" },
  { value: "laminado", label: "Laminado" },
  { value: "hardwood", label: "Hardwood" },
  { value: "tile", label: "Tile" },
  { value: "refinish", label: "Refinish" },
  { value: "unfinished", label: "Unfinished" },
];

const PISO_ATUAL_OPTIONS: { value: PisoTipo; label: string }[] = [
  { value: "carpete", label: "Carpete" },
  { value: "vinyl_lvp", label: "Vinyl/LVP" },
  { value: "laminado", label: "Laminado" },
  { value: "hardwood", label: "Hardwood" },
  { value: "tile", label: "Tile" },
  { value: "concreto_exposto", label: "Concreto exposto" },
];

const PREPARO_OPTIONS: { value: PreparoNivel; label: string }[] = [
  { value: "nenhuma", label: "Nenhuma" },
  { value: "simples", label: "Prep simples" },
  { value: "pesada", label: "Prep pesada" },
];

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

interface RoomDraft {
  localId: string;
  nome: string;
  areaSqft: number;
  pisoNovo: PisoTipo;
  pisoAtual: PisoTipo;
  preparo: PreparoNivel;
}

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

const emptyRoom = (): RoomDraft => ({
  localId: crypto.randomUUID(),
  nome: "",
  areaSqft: 0,
  pisoNovo: "vinyl_lvp",
  pisoAtual: "carpete",
  preparo: "nenhuma",
});

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

function InputPage() {
  const { user } = useAuth();

  const [nomeCliente, setNomeCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [email, setEmail] = useState("");

  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()]);
  const [extras, setExtras] = useState<ExtrasDraft>(emptyExtras());
  const [segundoAndarSemElevador, setSegundoAndarSemElevador] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addRoom = () => setRooms((prev) => [...prev, emptyRoom()]);

  const removeRoom = (localId: string) =>
    setRooms((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.localId !== localId)));

  const updateRoom = (localId: string, patch: Partial<RoomDraft>) =>
    setRooms((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));

  const resetForm = () => {
    setNomeCliente("");
    setTelefone("");
    setEndereco("");
    setEmail("");
    setRooms([emptyRoom()]);
    setExtras(emptyExtras());
    setSegundoAndarSemElevador(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (rooms.some((r) => !r.nome.trim() || r.areaSqft <= 0)) {
      toast.error("Cada ambiente precisa de nome e área maior que zero");
      return;
    }

    setSubmitting(true);

    const { data: lead, error: leadError } = await supabase
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
    if (leadError || !lead) {
      setSubmitting(false);
      return toast.error(leadError?.message ?? "Erro ao criar lead");
    }

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({ lead_id: lead.id, partner_id: user.id, status: "rascunho" })
      .select()
      .single();
    if (proposalError || !proposal) {
      setSubmitting(false);
      return toast.error(proposalError?.message ?? "Erro ao criar proposta");
    }

    const { error: roomsError } = await supabase.from("proposal_rooms").insert(
      rooms.map((r) => ({
        proposal_id: proposal.id,
        nome: r.nome,
        area_sqft: r.areaSqft,
        piso_novo: r.pisoNovo,
        piso_atual: r.pisoAtual,
        preparo: r.preparo,
      })),
    );
    if (roomsError) {
      setSubmitting(false);
      return toast.error(roomsError.message);
    }

    const { error: extrasError } = await supabase.from("proposal_extras").insert({
      proposal_id: proposal.id,
      ...extras,
      segundo_andar_sem_elevador: segundoAndarSemElevador,
    });
    if (extrasError) {
      setSubmitting(false);
      return toast.error(extrasError.message);
    }

    // Precifica a proposta a partir da medição + Motor de Preços.
    // Se falhar (ex: preço faltando), o rascunho continua salvo — só avisa.
    const { error: calcError } = await supabase.rpc("rpc_calcular_proposta", {
      p_proposal_id: proposal.id,
    });
    if (calcError) {
      toast.warning("Rascunho salvo, mas o cálculo falhou: " + calcError.message);
    } else {
      toast.success("Orçamento rascunho criado e precificado");
    }
    setSubmitting(false);
    resetForm();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Novo Orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Registre o cliente e a medição do ambiente após a visita técnica.
        </p>
      </div>

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
            <CardDescription>Um registro por cômodo medido</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRoom}>
            <Plus className="mr-1 h-4 w-4" /> Ambiente
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {rooms.map((room, i) => (
            <div key={room.localId} className="grid gap-3 rounded-lg border p-4 md:grid-cols-5">
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
                <Select
                  value={room.pisoNovo}
                  onValueChange={(v) => updateRoom(room.localId, { pisoNovo: v as PisoTipo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PISO_NOVO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Piso atual</Label>
                <Select
                  value={room.pisoAtual}
                  onValueChange={(v) => updateRoom(room.localId, { pisoAtual: v as PisoTipo })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PISO_ATUAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 md:col-span-5">
                <div className="flex-1 space-y-2">
                  <Label>Preparação</Label>
                  <Select
                    value={room.preparo}
                    onValueChange={(v) => updateRoom(room.localId, { preparo: v as PreparoNivel })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PREPARO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                onChange={(e) =>
                  setExtras((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="segundo-andar"
              checked={segundoAndarSemElevador}
              onCheckedChange={(v) => setSegundoAndarSemElevador(v === true)}
            />
            <Label htmlFor="segundo-andar" className="cursor-pointer">
              2º andar sem elevador
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Salvando…" : "Criar orçamento rascunho"}
        </Button>
      </div>
    </form>
  );
}
