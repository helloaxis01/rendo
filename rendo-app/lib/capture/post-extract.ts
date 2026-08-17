import { Capacitor, CapacitorHttp } from "@capacitor/core";

type ExtractResponse = {
  recipes?: unknown[];
  error?: string;
  warning?: string;
  status?: string;
  message?: string;
  mode?: string;
};

export async function postExtract(
  body: unknown,
  signal: AbortSignal
): Promise<{ ok: boolean; data: ExtractResponse }> {
  const json = JSON.stringify(body);
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      signal,
    });
    const data = (await res.json().catch(() => ({}))) as ExtractResponse;
    return { ok: res.ok, data };
  } catch (error) {
    if (signal.aborted) throw error;
    if (!Capacitor.isNativePlatform()) throw error;
    const native = await CapacitorHttp.post({
      url: `${window.location.origin}/api/extract`,
      headers: { "Content-Type": "application/json" },
      data: body,
      readTimeout: 60_000,
      connectTimeout: 15_000,
      responseType: "json",
    });
    const raw = native.data;
    const data = (
      typeof raw === "string" ? JSON.parse(raw) : raw ?? {}
    ) as ExtractResponse;
    return {
      ok: native.status >= 200 && native.status < 300,
      data,
    };
  }
}
