import * as async_hooks from "node:async_hooks";

// @ts-expect-error - This is bundled
import middleware from "middleware-stub";
import { NextConfig } from "types/next-types";
import type { InternalEvent, InternalResult } from "types/open-next";
import { emptyReadableStream } from "utils/stream";

// We import it like that so that the edge plugin can replace it
import { fleekInternalEventConverter } from "../converters/fleek";
import { createGenericHandler } from "../core/createGenericHandler";
import {
  convertBodyToReadableStream,
  convertToQueryString,
} from "../core/routing/util";

declare global {
  var isEdgeRuntime: true;
  var NextConfig: NextConfig;
}

const defaultHandler = async (
  internalEvent: InternalEvent,
): Promise<InternalResult> => {
  // @ts-expect-error - This is a polyfill
  globalThis.AsyncLocalStorage = async_hooks.AsyncLocalStorage;
  globalThis.isEdgeRuntime = true;

  console.log("Internal event:", JSON.stringify(internalEvent, null, 2));

  const host = internalEvent.headers.host
    ? `https://${internalEvent.headers.host}`
    : "http://localhost:3000";
  const initialUrl = new URL(internalEvent.rawPath, host);
  initialUrl.search = convertToQueryString(internalEvent.query);
  const url = initialUrl.toString();

  console.log("Middleware handler:", JSON.stringify(middleware, null, 2));

  const nextConfig = globalThis.NextConfig as NextConfig;

  const response: Response = await middleware({
    headers: internalEvent.headers,
    method: internalEvent.method || "GET",
    nextConfig: {
      basePath: nextConfig.basePath,
      i18n: nextConfig.i18n,
      trailingSlash: nextConfig.trailingSlash,
    },
    url,
    body: convertBodyToReadableStream(internalEvent.method, internalEvent.body),
  });

  console.log("Response:", JSON.stringify(response, null, 2));

  const responseHeaders: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      responseHeaders[key] = responseHeaders[key]
        ? [...responseHeaders[key], value]
        : [value];
    } else {
      responseHeaders[key] = value;
    }
  });

  console.log("Response headers:", JSON.stringify(responseHeaders, null, 2));

  const body =
    (response.body as ReadableStream<Uint8Array>) ?? emptyReadableStream();

  console.log("Body:", JSON.stringify(body, null, 2));

  return {
    type: "core",
    statusCode: response.status,
    headers: responseHeaders,
    body: body,
    // Do we need to handle base64 encoded response?
    isBase64Encoded: false,
  };
};

export const main = await createGenericHandler({
  handler: defaultHandler,
  converter: fleekInternalEventConverter,
  type: "middleware",
});

export default {
  fetch: main,
};
