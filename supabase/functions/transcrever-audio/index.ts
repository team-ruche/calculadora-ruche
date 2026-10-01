import { createClient } from "jsr:@supabase/supabase-js@2";

// Transcreve um audio curto gravado no formulario de medicao.
//
// O ditado nativo do navegador (Web Speech API) foi descartado: ele depende do
// servico de fala do Google e devolve "network" em preview embutido, em
// Chromium sem as chaves do Google e em navegadores com shield. Whisper roda
// com a nossa chave e funciona em qualquer lugar que grave audio.
//
// Secret necessario: OPENAI_API_KEY.
// Opcional: OPENAI_TRANSCRIBE_MODEL (default whisper-1).

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

// OpenAI deduz o formato pela EXTENSAO do arquivo, nao pelo mime. Sem o nome
// certo a chamada volta 400 dizendo que o formato nao e suportado.
const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

const MAX_BYTES = 20 * 1024 * 1024; // OpenAI aceita 25MB; folga para o envelope.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") ?? "whisper-1";
  if (!openaiKey) {
    return json({ error: "OPENAI_API_KEY não configurada nesta função." }, 503);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json({ error: "Não autenticado" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Envie o áudio como multipart/form-data no campo 'file'" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Campo 'file' ausente" }, 400);
  if (file.size === 0) return json({ error: "Áudio vazio" }, 400);
  if (file.size > MAX_BYTES) {
    return json({ error: "Áudio longo demais. Grave em trechos de até ~5 minutos." }, 413);
  }

  const baseMime = (file.type || "audio/webm").split(";")[0];
  const ext = EXT[baseMime] ?? "webm";

  const out = new FormData();
  out.append("file", file, `nota.${ext}`);
  out.append("model", model);
  // Sem `language` de proposito: o parceiro pode ditar em ingles ou portugues,
  // e forcar um idioma transforma o outro em lixo.
  out.append("response_format", "json");

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: out,
  });

  if (!resp.ok) {
    const detalhe = await resp.text();
    return json({ error: `OpenAI ${resp.status}`, detalhe: detalhe.slice(0, 500) }, 502);
  }

  const data = await resp.json();
  const texto = (data?.text ?? "").trim();
  if (!texto) return json({ error: "Não deu para entender o áudio. Grave de novo." }, 422);

  return json({ ok: true, texto, modelo: model });
});
