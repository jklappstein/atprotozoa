// droneloop Worker — static assets only. Everything (audio, patches) lives in
// the browser and the user's own PDS.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
