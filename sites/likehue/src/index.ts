// Served at the root of likehue.bisks.net, so requests pass straight
// through to the static-asset router — no mount-prefix stripping needed.
//
// /api/avatar — cdn.bsky.app sends no Access-Control-Allow-Origin, so a
// crossOrigin="anonymous" <img> of a pfp always errors and the page can't read
// its pixels. This same-origin proxy hands the browser the bytes with CORS-free
// access. Locked to cdn.bsky.app/img/avatar* so it isn't an open image proxy.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/avatar") {
      let target: URL;
      try { target = new URL(url.searchParams.get("u") || ""); } catch { return new Response("bad url", { status: 400 }); }
      if (target.protocol !== "https:" || target.hostname !== AVATAR_HOST || !target.pathname.startsWith("/img/avatar")) {
        return new Response("not an avatar url", { status: 400 });
      }
      const r = await fetch(target.toString(), { cf: { cacheEverything: true, cacheTtl: 604800 } } as RequestInit);
      if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
      return new Response(r.body, {
        headers: {
          "content-type": r.headers.get("content-type") || "image/webp",
          "cache-control": "public, max-age=604800",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
