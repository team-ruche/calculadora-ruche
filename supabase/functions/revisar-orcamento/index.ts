import { createClient } from "jsr:@supabase/supabase-js@2";

// Le a transcricao da visita e compara com o que o parceiro de fato mediu.
// Devolve o que o cliente pediu e NAO aparece no orcamento — e so isso. Nao
// inventa preco, nao sugere valor: quem decide numero e o closer, na aba de
// pricing. O parecer fica gravado em proposals.ai_review.
//
// Secret necessario: OPENAI_API_KEY (supabase secrets set OPENAI_API_KEY=...).
// Opcional: OPENAI_MODEL (default gpt-4.1-mini).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

type Room = {
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
};

type Item = { grupo: string; componente: string; unidade: string; quantidade: number };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "faltando", "conferido"],
  properties: {
    resumo: { type: "string" },
    faltando: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["o_que", "evidencia", "gravidade"],
        properties: {
          o_que: { type: "string" },
          evidencia: { type: "string" },
          gravidade: { type: "string", enum: ["alta", "media", "baixa"] },
        },
      },
    },
    conferido: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = [
  "You audit flooring quotes for a contractor.",
  "You get the transcript of the in-home visit and the measurement the installer filled in.",
  "Your only job: list what the customer asked for in the transcript that is NOT reflected in the measurement.",
  "Also flag rooms with no photo, and rooms whose scope the transcript contradicts.",
  "Never invent prices, never suggest an amount — pricing is the closer's call.",
  "If the transcript is empty or says nothing useful, say so in `resumo` and return an empty `faltando`.",
  "Quote the transcript verbatim in `evidencia`. If you cannot quote it, do not raise the item.",
  "Write in English.",
].join(" ");

function medicaoTexto(rooms: Room[], itens: Item[], fotosPorRoom: Record<string, number>): string {
  const linhasRooms = rooms.map((r) => {
    const partes = [
      `${r.nome}: ${r.area_sqft} sqft`,
      `current floor ${r.piso_atual || "(blank)"} -> new floor ${r.piso_novo || "(blank)"}`,
      `remove current floor: ${r.remocao === false ? "no" : "yes"}`,
      `prep: ${r.preparo}`,
      `furniture to move: ${r.mover_moveis ? `${r.mover_moveis_horas ?? 0}h` : "no"}`,
      `extra services: ${(r.servicos ?? []).join(", ") || "none"}`,
      `photos attached: ${fotosPorRoom[r.nome] ?? 0}`,
      `installer note: ${r.observacao || "none"}`,
    ];
    return "- " + partes.join(" | ");
  });
  const linhasItens = itens.map(
    (i) => `- [${i.grupo}] ${i.componente} — ${i.quantidade} ${i.unidade}`,
  );
  return [
    "ROOMS MEASURED:",
    linhasRooms.join("\n") || "(none)",
    "",
    "QUOTE LINES:",
    linhasItens.join("\n") || "(none)",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";
  if (!openaiKey) {
    return json(
      { error: "OPENAI_API_KEY nao configurada nesta função. Rode: supabase secrets set OPENAI_API_KEY=..." },
      503,
    );
  }

  const admin = createClient(url, serviceKey);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json({ error: "Não autenticado" }, 401);

  let body: { proposal_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const pid = body.proposal_id;
  if (!pid) return json({ error: "proposal_id obrigatório" }, 400);

  // Mesma regra da RLS: dono da proposta ou ruche.
  const { data: prop } = await admin
    .from("proposals")
    .select("id, partner_id, transcricao, notas, leads(nome_cliente)")
    .eq("id", pid)
    .maybeSingle();
  if (!prop) return json({ error: "Orçamento não encontrado" }, 404);

  if (prop.partner_id !== caller.user.id) {
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .eq("role", "ruche")
      .maybeSingle();
    if (!role) return json({ error: "Sem permissão para este orçamento" }, 403);
  }

  const transcricao = (prop.transcricao ?? prop.notas ?? "").trim();
  if (!transcricao) {
    return json({ error: "Sem transcrição para comparar. Cole a conversa no orçamento." }, 400);
  }

  const [{ data: rooms }, { data: itens }, { data: media }] = await Promise.all([
    admin.from("proposal_rooms").select("*").eq("proposal_id", pid),
    admin.from("proposal_items").select("grupo, componente, unidade, quantidade").eq("proposal_id", pid),
    admin.from("proposal_room_media").select("room_id").eq("proposal_id", pid),
  ]);

  const fotosPorRoomId: Record<string, number> = {};
  for (const m of (media as { room_id: string }[]) ?? []) {
    fotosPorRoomId[m.room_id] = (fotosPorRoomId[m.room_id] ?? 0) + 1;
  }
  const fotosPorRoom: Record<string, number> = {};
  for (const r of (rooms as (Room & { id: string })[]) ?? []) {
    fotosPorRoom[r.nome] = fotosPorRoomId[r.id] ?? 0;
  }

  const userMsg = [
    `CUSTOMER: ${(prop.leads as { nome_cliente: string } | null)?.nome_cliente ?? "unknown"}`,
    "",
    medicaoTexto((rooms as Room[]) ?? [], (itens as Item[]) ?? [], fotosPorRoom),
    "",
    "VISIT TRANSCRIPT:",
    transcricao,
  ].join("\n");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "revisao", strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    return json({ error: `OpenAI ${resp.status}`, detalhe: detalhe.slice(0, 500) }, 502);
  }

  const completion = await resp.json();
  const raw = completion?.choices?.[0]?.message?.content;
  let review: Record<string, unknown>;
  try {
    review = JSON.parse(raw);
  } catch {
    return json({ error: "Resposta da IA não veio em JSON" }, 502);
  }
  review.modelo = model;

  const agora = new Date().toISOString();
  const { error: upErr } = await admin
    .from("proposals")
    .update({ ai_review: review, ai_review_at: agora })
    .eq("id", pid);
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ ok: true, review, ai_review_at: agora });
});
