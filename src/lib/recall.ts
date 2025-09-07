const BASE_URL = "https://api.recall.ai/api/v1";

function must<T>(v: T | undefined | null, name: string): T {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function recallFetch(path: string, opts: RequestInit = {}) {
  const apiKey = must(process.env.RECALL_API_KEY, "RECALL_API_KEY");

  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    // Evita cache en dev
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Recall API error ${res.status}: ${text || res.statusText}`);
  }
  // Cuando el endpoint devuelve 204, no hay json
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Programa un bot para un meeting_url en `join_at` (= startTime - N minutos)
 * Devuelve el objeto bot creado (contiene `id`).
 * ⚠️ Permitido: POST /bots. Prohibido: GET /bots (listado).
 */
export async function scheduleRecallBot(meetingUrl: string, startTime: Date) {
  const minutes = parseInt(process.env.RECALL_JOIN_MINUTES_BEFORE || "5", 10);
  const joinAt = new Date(startTime.getTime() - minutes * 60 * 1000).toISOString();

  // Según docs quickstart, el mínimo es meeting_url; opcional join_at.
  return recallFetch("/bots/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: meetingUrl,
      join_at: joinAt,
      // Podés setear opciones extra si tu plan/uso lo requiere:
      // "transcription":"all", "audio":"true", "video":"false", etc.
    }),
  });
}

/**
 * Consulta el estado de un bot por ID (no listamos, solo GET por id).
 * Esperamos campos como status y URLs de media/transcript cuando haya terminado.
 */
export async function getRecallBot(botId: string) {
  return recallFetch(`/bots/${botId}/`, { method: "GET" });
}

/**
 * (Helper) Descarga un transcript de una URL pública o firmada.
 * Si Recall te da una URL firmada, deberías poder leerla con fetch directo.
 */
export async function fetchTranscriptText(url?: string | null) {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch {
    return null;
  }
}
