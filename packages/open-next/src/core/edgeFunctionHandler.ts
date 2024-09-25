// Necessary files will be imported here with banner in esbuild

import type { OutgoingHttpHeaders } from "http";

interface RequestData {
  geo?: {
    city?: string;
    country?: string;
    region?: string;
    latitude?: string;
    longitude?: string;
  };
  headers: OutgoingHttpHeaders;
  ip?: string;
  method: string;
  nextConfig?: {
    basePath?: string;
    i18n?: any;
    trailingSlash?: boolean;
  };
  page?: {
    name?: string;
    params?: { [key: string]: string | string[] };
  };
  url: string;
  body?: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}

interface Entries {
  [k: string]: {
    default: (props: { page: string; request: RequestData }) => Promise<{
      response: Response;
      waitUntil: Promise<void>;
    }>;
  };
}
declare global {
  var _ENTRIES: Entries;
  var _ROUTES: EdgeRoute[];
  var __storage__: Map<unknown, unknown>;
  var AsyncContext: any;
}

export interface EdgeRoute {
  name: string;
  page: string;
  regex: string[];
}

type EdgeRequest = Omit<RequestData, "page">;

export default async function edgeFunctionHandler(
  request: EdgeRequest,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  console.log("Path:", path);
  const routes = globalThis._ROUTES;
  const correspondingRoute = routes.find((route) =>
    route.regex.some((r) => new RegExp(r).test(path)),
  );
  console.log("Corresponding route:", correspondingRoute);

  if (!correspondingRoute) {
    console.log("Routes:", JSON.stringify(routes, null, 2));
    console.log("No route found for", JSON.stringify(request, null, 2));
    throw new Error(`No route found for ${request.url}`);
  }

  console.log("Entries:", JSON.stringify(globalThis._ENTRIES, null, 2));

  const entry = self._ENTRIES[`middleware_${correspondingRoute.name}`];

  console.log("self._ENTRIES", JSON.stringify(self._ENTRIES, null, 2));
  console.log("Entry:", JSON.stringify(entry, null, 2));

  const result = await entry.default({
    page: correspondingRoute.page,
    request: {
      ...request,
      page: {
        name: correspondingRoute.name,
      },
    },
  });

  console.log("Result:", JSON.stringify(result, null, 2));

  await result.waitUntil;
  const response = result.response;
  return response;
}

export { edgeFunctionHandler as main };
