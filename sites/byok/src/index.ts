// byok Worker — static assets plus a narrow same-origin Hydracept proxy.
// The site owner's key lives in wrangler secrets; visitors may instead send
// their own Bearer token per request (BYOK) without the Worker storing it.
import {
  bearerFromRequest,
  bytesToBase64,
  clientIp,
  hostedConfigured,
  quoteCapability,
  quoteDisplay,
  runCapabilityJob,
  fetchSessionProject,
  rateLimitIp,
  validateCapabilityInput,
} from "./hydracept";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HYDRACEPT_API_KEY?: string;
  HYDRACEPT_PROJECT?: string;
  HYDRACEPT_ENVIRONMENT?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function unauthorized(): Response {
  return json({ error: "no Hydracept credentials" }, 401);
}

async function resolveContext(request: Request, env: Env, token: string) {
  const usingHosted = token === env.HYDRACEPT_API_KEY?.trim();
  if (usingHosted && hostedConfigured(env)) {
    return {
      ok: true as const,
      context: {
        projectId: env.HYDRACEPT_PROJECT!.trim(),
        environment: (env.HYDRACEPT_ENVIRONMENT || "development").trim(),
      },
    };
  }
  const session = await fetchSessionProject(token);
  if (!session.ok) return { ok: false as const, message: session.message };
  return { ok: true as const, context: { projectId: session.projectId, environment: session.environment } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/hydracept")) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type",
        },
      });
    }

    const ip = clientIp(request);

    if (url.pathname === "/api/hydracept/status" && request.method === "GET") {
      return json({ hosted: hostedConfigured(env) });
    }

    const token = bearerFromRequest(request, env);
    if (!token) return unauthorized();

    if (url.pathname === "/api/hydracept/session" && request.method === "GET") {
      const rate = await rateLimitIp(ip, "session", 120, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);
      const session = await fetchSessionProject(token);
      if (!session.ok) return json({ error: session.message }, 502);
      return json({ projectId: session.projectId, environment: session.environment });
    }

    if (url.pathname === "/api/hydracept/quote" && request.method === "POST") {
      const rate = await rateLimitIp(ip, "quote", 60, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);

      let body: { capability?: string; input?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const capability = String(body.capability || "");
      const validated = validateCapabilityInput(capability, body.input);
      if (!validated.ok) return json({ error: validated.error }, 400);

      const quoted = await quoteCapability(token, capability, validated.input);
      if (!quoted.ok) return json({ error: quoted.message }, quoted.status >= 500 ? 502 : quoted.status);
      return json({
        quoteId: quoted.body.quoteId,
        display: quoteDisplay(quoted.body),
        expiresAt: quoted.body.expiresAt,
        capability,
      });
    }

    if (url.pathname === "/api/hydracept/run" && request.method === "POST") {
      const rate = await rateLimitIp(ip, "run", hostedConfigured(env) ? 12 : 30, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);

      let body: { capability?: string; input?: unknown; quoteId?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const capability = String(body.capability || "");
      const quoteId = String(body.quoteId || "").trim();
      if (!quoteId) return json({ error: "quoteId required" }, 400);

      const validated = validateCapabilityInput(capability, body.input);
      if (!validated.ok) return json({ error: validated.error }, 400);

      const ctx = await resolveContext(request, env, token);
      if (!ctx.ok) return json({ error: ctx.message }, 502);

      const ran = await runCapabilityJob(
        token,
        capability,
        validated.input,
        quoteId,
        ctx.context,
      );
      if (!ran.ok) return json({ error: ran.message }, ran.status >= 500 ? 502 : ran.status);

      const b64 = bytesToBase64(ran.bytes);
      return json({
        jobId: ran.jobId,
        mediaType: ran.mediaType,
        dataBase64: b64,
      });
    }

    return json({ error: "not found" }, 404);
  },
};
