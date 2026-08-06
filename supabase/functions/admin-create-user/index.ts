import { createClient } from "jsr:@supabase/supabase-js@2";

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

function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("") + "!7";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // Identifica quem chama a partir do JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json({ error: "Não autenticado" }, 401);

  // Só Ruche pode criar usuários.
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.user.id)
    .eq("role", "ruche")
    .maybeSingle();
  if (!roleRow) return json({ error: "Apenas administradores Ruche podem criar usuários" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const nome = String(body.nome ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const telefone = String(body.telefone ?? "").trim();
  const nicho = body.nicho ? String(body.nicho).trim() : null;
  const endereco_empresa = body.endereco_empresa ? String(body.endereco_empresa).trim() : null;
  const ein = body.ein ? String(body.ein).trim() : null;
  const role = body.role === "ruche" ? "ruche" : "parceiro";

  if (!nome || !email || !telefone) {
    return json({ error: "Nome, e-mail e telefone são obrigatórios" }, 400);
  }

  const senha = tempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, telefone },
  });
  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? "Falha ao criar usuário" }, 400);
  }

  const uid = created.user.id;

  // Atualiza o perfil (o trigger já criou a linha) com os campos extras + aprova.
  const { error: updErr } = await admin
    .from("users")
    .update({ nome, telefone, nicho, endereco_empresa, ein, role, status: "aprovado" })
    .eq("id", uid);
  if (updErr) return json({ error: updErr.message }, 400);

  // Garante o papel correto em user_roles.
  await admin.from("user_roles").delete().eq("user_id", uid);
  await admin.from("user_roles").insert({ user_id: uid, role });

  // Parceiro já nasce aprovado por aqui — cria a opção dele no dropdown
  // "Assigned Partner" do GHL + ghl_partner_map, senão a visita marcada pelo
  // call center nunca cai no kanban dele. Best-effort, não trava a criação.
  if (role === "parceiro") {
    provisionPartnerInGhl(admin, uid, nome).catch((e) =>
      console.error("provisionPartnerInGhl falhou:", e),
    );
  }

  return json({ ok: true, id: uid, senha_temporaria: senha });
});

async function provisionPartnerInGhl(
  admin: ReturnType<typeof createClient>,
  partnerUserId: string,
  partnerNome: string,
) {
  const n8nWebhookUrl =
    Deno.env.get("N8N_GHL_SYNC_OUTBOUND_URL") ?? "https://workflows.ruchedigital.online/webhook/ghl-sync-outbound";
  const n8nSecret = Deno.env.get("N8N_GHL_SYNC_SECRET") ?? "3OqEzmOOFjxcr1xaRwG2DXp-mcIvQZTkUKXSk9ReOrU";

  const { data: pConfigs } = await admin
    .from("ghl_pipeline_config")
    .select("location_id, assigned_partner_field_id")
    .eq("ativo", true)
    .limit(1);
  const pConfig = pConfigs?.[0];
  if (!pConfig?.assigned_partner_field_id) return;

  await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": n8nSecret },
    body: JSON.stringify({
      action: "provision_partner",
      location_id: pConfig.location_id,
      config: { assigned_partner_field_id: pConfig.assigned_partner_field_id },
      payload: { partner_label: partnerNome, partner_id: partnerUserId },
    }),
  });
}
