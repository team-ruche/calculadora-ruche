// Turns a failed call to the transcription function into a specific, user-facing
// message. Kept free of app imports so it can be unit-tested with node --test.

type MaybeFnError = {
  name?: string;
  message?: string;
  context?: unknown;
} | null;

const isResponse = (v: unknown): v is Response =>
  typeof v === "object" && v !== null && "status" in v && typeof (v as Response).text === "function";

async function readBody(res: Response): Promise<{ error?: string; message?: string; code?: string } | null> {
  try {
    const text = await res.clone().text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 200) };
    }
  } catch {
    return null;
  }
}

export async function transcribeErrorMessage(
  error: MaybeFnError | undefined,
  data?: { error?: string } | null,
): Promise<string> {
  // Function answered 2xx but reported an error in the body.
  if (!error && data?.error) return data.error;
  if (!error) return "Transcription failed.";

  // Request never got an HTTP answer: offline, CORS preflight rejected, or the
  // function is not deployed (its OPTIONS returns 404, which the browser
  // reports as a network failure).
  if (error.name === "FunctionsFetchError" || error.name === "FunctionsRelayError") {
    return "Couldn't reach the transcription service. It may not be deployed yet, or your connection dropped. Your recording was kept — retry or download it.";
  }

  if (error.name === "FunctionsHttpError" && isResponse(error.context)) {
    const res = error.context;
    const body = await readBody(res);
    if (res.status === 404 || body?.code === "NOT_FOUND") {
      return "The transcription service is not deployed. Your recording was kept — download it or retry later.";
    }
    if (res.status === 401) return "Your session expired. Sign in again, then retry.";
    const detail = body?.error ?? body?.message;
    return detail ? `Transcription failed (${res.status}): ${detail}` : `Transcription failed (HTTP ${res.status}).`;
  }

  return error.message || "Transcription failed.";
}
