// horoscoped Worker — horoscoped.bisks.net
// All the work happens in the browser; this just forwards to static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
