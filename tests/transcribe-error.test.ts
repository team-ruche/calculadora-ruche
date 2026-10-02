import assert from "node:assert/strict";
import { test } from "node:test";
import { transcribeErrorMessage } from "../src/lib/transcribe-error.ts";

test("network / undeployed function gives a specific, retry-friendly message", async () => {
  const msg = await transcribeErrorMessage({
    name: "FunctionsFetchError",
    message: "Failed to send a request to the Edge Function",
  });
  assert.match(msg, /Couldn't reach the transcription service/);
  assert.match(msg, /recording was kept/);
});

test("HTTP 404 NOT_FOUND says the function is not deployed", async () => {
  const res = new Response(
    JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" }),
    { status: 404 },
  );
  const msg = await transcribeErrorMessage({
    name: "FunctionsHttpError",
    message: "x",
    context: res,
  });
  assert.match(msg, /not deployed/);
});

test("HTTP error body is extracted", async () => {
  const res = new Response(
    JSON.stringify({ error: "OPENAI_API_KEY não configurada nesta função." }),
    { status: 503 },
  );
  const msg = await transcribeErrorMessage({
    name: "FunctionsHttpError",
    message: "x",
    context: res,
  });
  assert.equal(msg, "Transcription failed (503): OPENAI_API_KEY não configurada nesta função.");
});

test("401 asks to sign in again", async () => {
  const res = new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  assert.match(
    await transcribeErrorMessage({ name: "FunctionsHttpError", context: res }),
    /Sign in again/,
  );
});

test("2xx body error is passed through", async () => {
  assert.equal(await transcribeErrorMessage(null, { error: "Áudio vazio" }), "Áudio vazio");
});
