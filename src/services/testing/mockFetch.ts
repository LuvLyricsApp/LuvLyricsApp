/**
 * Test helper: routes global fetch by URL prefix. Anything unmatched fails
 * like a dead network, which is exactly what a provider cascade must survive.
 */

type Body = unknown;
export type Route = [prefix: string, body: Body | ((url: string) => Body)];

export interface FetchMock {
  calls: string[];
  restore: () => void;
}

export const mockFetch = (routes: Route[]): FetchMock => {
  const original = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as Response;
    const body = typeof route[1] === 'function' ? (route[1] as (u: string) => Body)(url) : route[1];
    if (body === null) return { ok: false, status: 500, json: async () => ({}), text: async () => '' } as Response;
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      global.fetch = original;
    },
  };
};
