// qrface Worker — qrface.bisks.net
//
// Static shell + one endpoint: /api/check?d=<domain> asks "does a website live
// at https://<domain>/?" and answers {ok, url}. Only the verdict leaves the
// Worker, never the remote body.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const HOST = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

async function check(domain: string): Promise<Response> {
  const d = domain.trim().toLowerCase();
  // Hostnames only: needs a dot and an alphabetic TLD, so IP literals and
  // "localhost" never get fetched.
  if (!HOST.test(d)) return json({ ok: false, reason: "not a hostname" });
  const url = `https://${d}/`;
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000), // a slow host is as good as no host for a QR you want to scan now
      headers: { "user-agent": "qrface/1 (+https://qrface.bisks.net)", accept: "text/html,*/*;q=0.5" },
    });
    r.body?.cancel();
    // 401/403/429 mean something is there and answering (bot walls, logins).
    const ok = r.status < 400 || r.status === 401 || r.status === 403 || r.status === 429;
    return json({ ok, status: r.status, url });
  } catch (e) {
    return json({ ok: false, reason: "unreachable" });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const u = new URL(request.url);
    if (u.pathname === "/api/check") return check(u.searchParams.get("d") || "");
    return env.ASSETS.fetch(request);
  },
};
