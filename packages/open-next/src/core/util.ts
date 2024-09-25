// @ts-ignore
import NextServer from "next/dist/server/next-server.js";
import { InternalRoutesManifest, NextConfig } from "types/next-types.js";

import { debug } from "../adapters/logger.js";
import {
  applyOverride as applyNextjsRequireHooksOverride,
  overrideHooks as overrideNextjsRequireHooks,
} from "./require-hooks.js";

// WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react
// Step 1: Need to override the require hooks for React before Next.js server
//         overrides them with prebundled ones in the case of app dir
// Step 2: Import Next.js server
// Step 3: Apply the override after Next.js server is imported since the
//         override that Next.js does is done at import time

declare global {
  var NextConfig: NextConfig;
  var RoutesManifest: InternalRoutesManifest;
  var AppPathsManifestKeys: string[];
}

//#override requireHooks
overrideNextjsRequireHooks(globalThis.NextConfig);
applyNextjsRequireHooksOverride();
//#endOverride
const cacheHandlerPath = require.resolve("./cache.cjs");
// @ts-ignore
export const requestHandler = new NextServer.default({
  //#override requestHandlerHost
  hostname: "localhost",
  port: 3000,
  //#endOverride
  conf: {
    ...globalThis.NextConfig,
    // Next.js compression should be disabled because of a bug in the bundled
    // `compression` package — https://github.com/vercel/next.js/issues/11669
    compress: false,
    // By default, Next.js uses local disk to store ISR cache. We will use
    // our own cache handler to store the cache on S3.
    //#override stableIncrementalCache
    cacheHandler: cacheHandlerPath,
    cacheMaxMemorySize: 0, // We need to disable memory cache
    //#endOverride
    experimental: {
      ...globalThis.NextConfig.experimental,
      // This uses the request.headers.host as the URL
      // https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next-server.ts#L1749-L1754
      //#override trustHostHeader
      trustHostHeader: true,
      //#endOverride
      //#override experimentalIncrementalCacheHandler
      incrementalCacheHandlerPath: cacheHandlerPath,
      //#endOverride
    },
  },
  customServer: false,
  dev: false,
  dir: __dirname,
}).getRequestHandler();

//#override setNextjsPrebundledReact
export function setNextjsPrebundledReact(rawPath: string) {
  // WORKAROUND: Set `__NEXT_PRIVATE_PREBUNDLED_REACT` to use prebundled React — https://github.com/serverless-stack/open-next#workaround-set-__next_private_prebundled_react-to-use-prebundled-react

  const routes = [
    ...globalThis.RoutesManifest.routes.static,
    ...globalThis.RoutesManifest.routes.dynamic,
  ];

  const route = routes.find((route) =>
    new RegExp(route.regex).test(rawPath ?? "")
  );

  const isApp = globalThis.AppPathsManifestKeys.includes(route?.page ?? "");
  debug("setNextjsPrebundledReact", { url: rawPath, isApp, route });

  // app routes => use prebundled React
  if (isApp) {
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = globalThis.NextConfig
      .experimental.serverActions
      ? "experimental"
      : "next";
    return;
  }

  // page routes => use node_modules React
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = undefined;
}
//#endOverride
