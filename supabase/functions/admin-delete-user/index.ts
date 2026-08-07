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

  // Só Ruche pode excluir usuários.
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.user.id)
    .eq("role", "ruche")
    .maybeSingle();
  if (!roleRow) return json({ error: "Apenas administradores Ruche podem excluir usuários" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const userId = String(body.user_id ?? "").trim();
  if (!userId) return json({ error: "user_id é obrigatório" }, 400);
  if (userId === caller.user.id) return json({ error: "Você não pode excluir a si mesmo" }, 400);

  // Limpa vínculos e o perfil (o auth em cascata pode não cobrir tudo).
  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("users").delete().eq("id", userId);

  // Remove do auth (fonte de verdade do login).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: delErr.message }, 400);

  return json({ ok: true });
});
