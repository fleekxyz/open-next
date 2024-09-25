import { InitializationFunctionEvent } from "../adapters/dynamo-provider";
import { RevalidateEvent } from "../adapters/revalidate";
import { WarmerEvent, WarmerResponse } from "../adapters/warmer-function";
import { MiddlewareOutputEvent } from "../core/routingHandler";
import { FleekRequest, FleekResponse } from "../types/fleek";
import { Converter, InternalEvent, InternalResult } from "../types/open-next";

async function convertFromFleekRequestToInternalEvent(
  event: FleekRequest,
): Promise<InternalEvent> {
  const url = new URL(event.path, "http://0.0.0.0");
  return {
    type: "core",
    method: event.method,
    rawPath: event.path,
    url: event.headers?.host ? event.headers.host : url.toString(),
    body: event.body ? Buffer.from(event.body, "utf8") : undefined,
    headers: { host: url.toString(), ...event.headers },
    query: event.query ?? {},
    cookies: {},
    remoteAddress: "0.0.0.0",
  };
}

async function convertToFleekResponseFromInternalResult(
  result: InternalResult,
): Promise<FleekResponse> {
  return {
    status: result.statusCode,
    headers: convertHeaders(result.headers),
    body: result.body,
  };
}

function convertHeaders(headers: Record<string, string | string[]>) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return result;
}

async function convertFromFleekRequestToRevalidateEvent(
  event: FleekRequest,
): Promise<RevalidateEvent> {
  return {
    type: "revalidate",
    records: JSON.parse(event.body),
  };
}

async function convertToFleekResponseFromRevalidateEvent(
  result: RevalidateEvent,
): Promise<FleekResponse> {
  return {
    status: 200,
    headers: {
      "x-random-header": "random-value-3",
    },
    body: "random response 3",
  };
}

async function convertFromFleekRequestToInitializationFunctionEvent(
  event: FleekRequest,
): Promise<InitializationFunctionEvent> {
  return {
    type: "initializationFunction",
    requestType: JSON.parse(event.body).requestType,
    resourceId: "dynamodb-cache",
  };
}

async function convertToFleekResponseFromInitializationFunctionEvent(
  result: InitializationFunctionEvent,
): Promise<FleekResponse> {
  return {
    status: 200,
    headers: {
      "x-random-header": "random-value-2",
    },
    body: "random response 2",
  };
}

async function convertFromFleekRequestToWarmerEvent(
  event: FleekRequest,
): Promise<WarmerEvent> {
  const body = JSON.parse(event.body);

  return {
    type: "warmer",
    warmerId: body.warmerId,
    index: body.index,
    concurrency: body.concurrency,
    delay: body.delay,
  };
}

async function convertToFleekResponseFromWarmerEvent(
  result: WarmerResponse,
): Promise<FleekResponse> {
  return {
    status: 200,
    headers: {
      "x-random-header": "random-value",
    },
    body: "random response",
  };
}

async function convertToFleekResponseFromMiddlewareEvent(
  result: InternalResult | ({ type: "middleware" } & MiddlewareOutputEvent),
): Promise<FleekResponse> {
  if ("internalEvent" in result) {
    let url = result.internalEvent.url;
    if (!result.isExternalRewrite) {
      if (result.origin) {
        url = `${result.origin.protocol}://${result.origin.host}${
          result.origin.port ? `:${result.origin.port}` : ""
        }${url}`;
      } else {
        url = `https://${result.internalEvent.headers.host}${url}`;
      }
    }

    const req = new Request(url, {
      body: result.internalEvent.body,
      method: result.internalEvent.method,
      headers: {
        ...result.internalEvent.headers,
        "x-forwarded-host": result.internalEvent.headers.host,
      },
    });

    const cfCache =
      (result.isISR ||
        result.internalEvent.rawPath.startsWith("/_next/image")) &&
      process.env.DISABLE_CACHE !== "true"
        ? { cacheEverything: true }
        : {};

    const response = await fetch(req, {
      // This is a hack to make sure that the response is cached by Cloudflare
      // See https://developers.cloudflare.com/workers/examples/cache-using-fetch/#caching-html-resources
      // @ts-expect-error - This is a Cloudflare specific option
      cf: cfCache,
    });

    return await adapt(response);
  } else {
    const headers = new Headers();
    for (const [key, value] of Object.entries(result.headers)) {
      headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }

    const body = result.body as ReadableStream<Uint8Array>;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let chunk = await reader.read();
    let finalBody = "";
    while (chunk) {
      finalBody += decoder.decode(chunk.value, { stream: true });
      chunk = await reader.read();
    }

    return adapt(
      new Response(finalBody, {
        status: result.statusCode,
        headers: headers,
      }),
    );
  }
}

function adaptHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return result;
}

export async function adapt(request: Response): Promise<FleekResponse> {
  return {
    status: request.status,
    headers: adaptHeaders(request.headers),
    body: await request.text(),
  };
}

export const fleekInternalEventConverter = {
  convertFrom: convertFromFleekRequestToInternalEvent,
  convertTo: convertToFleekResponseFromInternalResult,
  name: "fleek",
} as Converter<InternalEvent, InternalResult>;

export const fleekRevalidateEventConverter = {
  convertFrom: convertFromFleekRequestToRevalidateEvent,
  convertTo: convertToFleekResponseFromRevalidateEvent,
  name: "fleek",
} as Converter<RevalidateEvent, RevalidateEvent>;

export const fleekInitializationFunctionEventConverter = {
  convertFrom: convertFromFleekRequestToInitializationFunctionEvent,
  convertTo: convertToFleekResponseFromInitializationFunctionEvent,
  name: "fleek",
} as Converter<InitializationFunctionEvent, InitializationFunctionEvent>;

export const fleekWarmerEventConverter = {
  convertFrom: convertFromFleekRequestToWarmerEvent,
  convertTo: convertToFleekResponseFromWarmerEvent,
  name: "fleek",
} as Converter<WarmerEvent, WarmerResponse>;

export const fleekMiddlewareEventConverter = {
  convertFrom: convertFromFleekRequestToInternalEvent,
  convertTo: convertToFleekResponseFromMiddlewareEvent,
  name: "fleek",
} as Converter<
  InternalEvent,
  InternalResult | ({ type: "middleware" } & MiddlewareOutputEvent)
>;
