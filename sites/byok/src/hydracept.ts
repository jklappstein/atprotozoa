// Hydracept proxy — network I/O for byok. Input rules live in
// public/lib/hydracept-pure.js (imported by tests too).
import {
  ALLOWED_CAPABILITIES,
  quoteDisplay,
  validateCapabilityInput,
} from "../public/lib/hydracept-pure.js";

export {
  ALLOWED_CAPABILITIES,
  parseImageSize,
  quoteDisplay,
  validateCapabilityInput,
  bytesToBase64,
} from "../public/lib/hydracept-pure.js";

export const HYDRACEPT_API = "https://api.hydracept.com/v1";

const CLIENT = "atprotozoa-byok/1";

export type HydraceptEnv = {
  HYDRACEPT_API_KEY?: string;
  HYDRACEPT_PROJECT?: string;
  HYDRACEPT_ENVIRONMENT?: string;
};

export function bearerFromRequest(request: Request, env: HydraceptEnv): string | null {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m?.[1]) return m[1];
  return env.HYDRACEPT_API_KEY?.trim() || null;
}

export function hostedConfigured(env: HydraceptEnv): boolean {
  return Boolean(env.HYDRACEPT_API_KEY?.trim() && env.HYDRACEPT_PROJECT?.trim());
}

function hydraceptHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Hydracept-Client": CLIENT,
    ...extra,
  };
}

async function hydraceptJson<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(`${HYDRACEPT_API}${path}`, {
    ...init,
    headers: { ...hydraceptHeaders(token), ...(init.headers as Record<string, string>) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { message?: string; code?: string };
      message = b.message || b.code || message;
    } catch {
      message = (await res.text().catch(() => message)) || message;
    }
    return { ok: false, status: res.status, message };
  }
  return { ok: true, data: (await res.json()) as T };
}

export async function fetchSessionProject(
  token: string,
): Promise<{ ok: true; projectId: string; environment: string } | { ok: false; message: string }> {
  const res = await hydraceptJson<Record<string, unknown>>("/diagnostics/session", token);
  if (!res.ok) return { ok: false, message: res.message };
  const data = res.data;
  const projectId = String(
    data.tokenProjectId || data.principalProjectId || data.projectId || "",
  ).trim();
  if (!projectId) return { ok: false, message: "no project on Hydracept key" };
  const environment = String(data.environment || data.defaultEnvironment || "development").trim();
  return { ok: true, projectId, environment };
}

export async function quoteCapability(
  token: string,
  capability: string,
  input: Record<string, unknown>,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const check = validateCapabilityInput(capability, input);
  if (!check.ok) return { ok: false, status: 400, message: check.error };
  const res = await hydraceptJson<Record<string, unknown>>(
    `/capabilities/${encodeURIComponent(capability)}/quote`,
    token,
    { method: "POST", body: JSON.stringify({ input: check.input }) },
  );
  if (!res.ok) return res;
  return { ok: true, body: res.data };
}

function newIdempotencyKey(): string {
  return `atprotozoa-${crypto.randomUUID()}`;
}

export async function runCapabilityJob(
  token: string,
  capability: string,
  input: Record<string, unknown>,
  quoteId: string,
  context: { projectId: string; environment: string; productId?: string },
  options: { pollMs?: number; deadlineMs?: number } = {},
): Promise<
  | { ok: true; mediaType: string; bytes: ArrayBuffer; jobId: string }
  | { ok: false; status: number; message: string }
> {
  const check = validateCapabilityInput(capability, input);
  if (!check.ok) return { ok: false, status: 400, message: check.error };

  const payload = {
    input: check.input,
    idempotencyKey: newIdempotencyKey(),
    context: {
      productId: context.productId || context.projectId,
      projectId: context.projectId,
      environment: context.environment || "development",
    },
    execution: { quoteId },
  };

  const submit = await hydraceptJson<{ jobId?: string; id?: string; status?: string }>(
    `/capabilities/${encodeURIComponent(capability)}/jobs`,
    token,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!submit.ok) return submit;

  const jobId = String(submit.data.jobId || submit.data.id || "");
  if (!jobId) return { ok: false, status: 502, message: "no jobId from Hydracept" };

  const deadline = Date.now() + (options.deadlineMs ?? 120_000);
  const interval = options.pollMs ?? 2000;
  let status = String(submit.data.status || "queued");

  while (!["succeeded", "failed", "canceled", "cancelled"].includes(status)) {
    if (Date.now() >= deadline) {
      return { ok: false, status: 504, message: "Hydracept job timed out" };
    }
    await sleep(interval);
    const poll = await hydraceptJson<{ status?: string }>(
      `/jobs/${encodeURIComponent(jobId)}`,
      token,
    );
    if (!poll.ok) return poll;
    status = String(poll.data.status || "unknown");
  }

  if (status !== "succeeded") {
    return { ok: false, status: 502, message: `job ${status}` };
  }

  const receipt = await hydraceptJson<{ artifacts?: Array<Record<string, unknown>> }>(
    `/jobs/${encodeURIComponent(jobId)}/receipt`,
    token,
  );
  if (!receipt.ok) return receipt;

  const artifacts = receipt.data.artifacts || [];
  const first = artifacts[0];
  const artifactId = String(first?.artifactId || first?.id || "");
  if (!artifactId) return { ok: false, status: 502, message: "no artifact on job" };

  const artRes = await fetch(
    `${HYDRACEPT_API}/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`,
    { headers: hydraceptHeaders(token, { "X-Hydracept-Export-Metadata": "1" }) },
  );
  if (!artRes.ok) {
    return { ok: false, status: artRes.status, message: "artifact download failed" };
  }
  const mediaType =
    artRes.headers.get("content-type")?.split(";")[0]?.trim() ||
    String(first?.mediaType || first?.mimeType || "application/octet-stream");
  const bytes = await artRes.arrayBuffer();
  return { ok: true, mediaType, bytes, jobId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function rateLimitIp(
  ip: string,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; used: number }> {
  const cache = (caches as unknown as { default: Cache }).default;
  const windowStart = Math.floor(Date.now() / (windowSec * 1000));
  const key = new Request(`https://hydracept-rate.local/${bucket}/${ip}/${windowStart}`);
  const hit = await cache.match(key);
  const used = hit ? parseInt(await hit.text(), 10) || 0 : 0;
  if (used >= limit) return { allowed: false, used };
  await cache.put(key, new Response(String(used + 1)), {
    expirationTtl: windowSec * 2,
  });
  return { allowed: true, used: used + 1 };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
