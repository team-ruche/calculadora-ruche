import { createClient } from "jsr:@supabase/supabase-js@2";

// Único ponto que o browser chama pra sincronizar com o GHL. Valida a sessão
// e a posse do proposal_id (mesma regra de RLS), depois repassa pro webhook
// do n8n (workflow ghl-sync-outbound) — o PIT do GHL fica só lá, nunca aqui
// nem no browser. Ver plano em .claude/plans (Sync GHL <-> Calculadora Ruche).

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

type Action = "cancel_appointment" | "push_quote_ready" | "provision_partner";

type MedicaoData = {
  sqft_real: number | null;
  piso_atual: string | null;
  subfloor: string | null;
  nivelamento_necessario: boolean | null;
  umidade_ok: boolean | null;
  observacoes: string | null;
} | null;

function summarizeMedicao(m: MedicaoData): string {
  if (!m) return "";
  const parts = [
    m.sqft_real ? `${m.sqft_real} sqft` : null,
    m.piso_atual ? `piso atual: ${m.piso_atual}` : null,
    m.subfloor ? `subfloor: ${m.subfloor}` : null,
    m.nivelamento_necessario ? "nivelamento necessário" : null,
    m.umidade_ok === false ? "umidade fora do padrão" : null,
    m.observacoes || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Sem tool disponível pra setar secrets de Edge Function nesta sessão —
  // fallback hardcoded (mesmo padrão já usado nos nodes do n8n desta conta).
  // Trocar por `supabase secrets set` quando alguém tiver acesso ao dashboard.
  const n8nWebhookUrl =
    Deno.env.get("N8N_GHL_SYNC_OUTBOUND_URL") ?? "https://workflows.ruchedigital.online/webhook/ghl-sync-outbound";
  const n8nSecret =
    Deno.env.get("N8N_GHL_SYNC_SECRET") ?? "3OqEzmOOFjxcr1xaRwG2DXp-mcIvQZTkUKXSk9ReOrU";
  // TODO confirmar o domínio real de produção do calculadora-ruche.
  const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://app.ruchedigital.online";
  const admin = createClient(url, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json({ error: "Não autenticado" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const action = body.action as Action;

  if (action === "provision_partner") {
    // Só ruche aprova/cria parceiro, então só ruche pode disparar isso.
    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .eq("role", "ruche")
      .maybeSingle();
    if (!callerRole) return json({ error: "Apenas ruche pode provisionar parceiro" }, 403);

    const partnerUserId = String(body.partner_user_id ?? "");
    if (!partnerUserId) return json({ error: "partner_user_id é obrigatório" }, 400);

    const { data: partnerUser, error: partnerErr } = await admin
      .from("users")
      .select("id, nome")
      .eq("id", partnerUserId)
      .maybeSingle();
    if (partnerErr || !partnerUser) return json({ error: "Parceiro não encontrado" }, 404);

    // Hoje só existe 1 location ativa — mesmo fallback usado no resto do arquivo.
    const { data: pConfigs, error: pConfigErr } = await admin
      .from("ghl_pipeline_config")
      .select("location_id, assigned_partner_field_id")
      .eq("ativo", true)
      .limit(1);
    const pConfig = pConfigs?.[0];
    if (pConfigErr || !pConfig?.assigned_partner_field_id) {
      return json({ error: "Nenhuma location com assigned_partner_field_id configurado" }, 400);
    }

    const n8nRes = await fetch(n8nWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Webhook-Secret": n8nSecret },
      body: JSON.stringify({
        action,
        location_id: pConfig.location_id,
        config: { assigned_partner_field_id: pConfig.assigned_partner_field_id },
        payload: { partner_label: partnerUser.nome, partner_id: partnerUser.id },
      }),
    });
    if (!n8nRes.ok) {
      const text = await n8nRes.text().catch(() => "");
      return json({ error: `Falha ao chamar o n8n (${n8nRes.status})`, detail: text }, 502);
    }
    return json({ ok: true });
  }

  const proposalId = String(body.proposal_id ?? "");
  if (!proposalId || !["cancel_appointment", "push_quote_ready"].includes(action)) {
    return json({ error: "proposal_id e action (cancel_appointment | push_quote_ready) são obrigatórios" }, 400);
  }

  const { data: prop, error: propErr } = await admin
    .from("proposals")
    .select("id, partner_id, ghl_opportunity_id, location_id, total_cliente, medicao")
    .eq("id", proposalId)
    .maybeSingle();
  if (propErr || !prop) return json({ error: "Orçamento não encontrado" }, 404);

  // Mesma regra de RLS: dono do lead ou ruche.
  const isOwner = prop.partner_id === caller.user.id;
  let isRuche = false;
  if (!isOwner) {
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .eq("role", "ruche")
      .maybeSingle();
    isRuche = !!roleRow;
  }
  if (!isOwner && !isRuche) return json({ error: "Sem permissão sobre este orçamento" }, 403);

  if (!prop.ghl_opportunity_id) {
    return json({ error: "Este lead não tem ghl_opportunity_id — nada pra sincronizar" }, 400);
  }

  // Resolve a config: por location_id explícito, ou a única config ativa (hoje só existe 1 cliente).
  let configQuery = admin.from("ghl_pipeline_config").select("*").eq("ativo", true);
  configQuery = prop.location_id
    ? configQuery.eq("location_id", prop.location_id)
    : configQuery.limit(1);
  const { data: configs, error: configErr } = await configQuery;
  const config = configs?.[0];
  if (configErr || !config) {
    return json({ error: "Nenhuma location do GHL configurada (ghl_pipeline_config)" }, 400);
  }

  const payload =
    action === "cancel_appointment"
      ? {}
      : {
          quote_link: `${publicAppUrl}/orcamento/${proposalId}`,
          scope_summary: summarizeMedicao(prop.medicao as MedicaoData),
          total_cliente: prop.total_cliente,
        };

  const n8nRes = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Secret": n8nSecret },
    body: JSON.stringify({
      action,
      proposal_id: proposalId,
      ghl_opportunity_id: prop.ghl_opportunity_id,
      location_id: config.location_id,
      config: {
        pipeline_id: config.pipeline_id,
        confirmed_stage_id: config.confirmed_stage_id,
        canceled_stage_id: config.canceled_stage_id,
        quote_link_field_id: config.quote_link_field_id,
        scope_summary_field_id: config.scope_summary_field_id,
      },
      payload,
    }),
  });

  if (!n8nRes.ok) {
    const text = await n8nRes.text().catch(() => "");
    return json({ error: `Falha ao chamar o n8n (${n8nRes.status})`, detail: text }, 502);
  }

  await admin.from("proposals").update({ last_ghl_sync_at: new Date().toISOString() }).eq("id", proposalId);

  return json({ ok: true });
});
