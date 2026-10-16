// deescalate Worker — served at the root of deescalate.bisks.net.
// Static game; just forwards to the ASSETS binding.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
