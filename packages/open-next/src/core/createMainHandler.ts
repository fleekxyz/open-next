import type { AsyncLocalStorage } from "node:async_hooks";

import type { OpenNextConfig, OverrideOptions } from "types/open-next";

import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
import type { IncrementalCache } from "../cache/incremental/types";
import type { Queue } from "../queue/types";
import { openNextHandler } from "./requestHandler.js";
import { resolveConverter, resolveTagCache, resolveWrapper } from "./resolve";

declare global {
  var queue: Queue;
  var incrementalCache: IncrementalCache;
  var fnName: string | undefined;
  var serverId: string;
  var __als: AsyncLocalStorage<string>;
}

async function resolveQueue(queue: OverrideOptions["queue"]) {
  if (typeof queue === "string") {
    const m = await import(`../queue/${queue}.js`);
    return m.default;
  } else if (typeof queue === "function") {
    return queue();
  } else {
    const m_1 = await import("../queue/sqs.js");
    return m_1.default;
  }
}

async function resolveIncrementalCache(
  incrementalCache: OverrideOptions["incrementalCache"],
) {
  if (typeof incrementalCache === "string") {
    const m = await import(`../cache/incremental/${incrementalCache}.js`);
    return m.default;
  } else if (typeof incrementalCache === "function") {
    return incrementalCache();
  } else {
    const m_1 = await import("../cache/incremental/s3.js");
    return m_1.default;
  }
}

export async function createMainHandler() {
  //First we load the config
  const config: OpenNextConfig = await import(
    process.cwd() + "/open-next.config.mjs"
  ).then((m) => m.default);

  const thisFunction = globalThis.fnName
    ? config.functions![globalThis.fnName]
    : config.default;

  globalThis.serverId = generateUniqueId();

  // Default queue
  globalThis.queue = await resolveQueue(thisFunction.override?.queue);

  globalThis.incrementalCache = await resolveIncrementalCache(
    thisFunction.override?.incrementalCache,
  );

  globalThis.tagCache = await resolveTagCache(thisFunction.override?.tagCache);

  globalThis.lastModified = {};

  // From the config, we create the adapter
  const adapter = await resolveConverter(thisFunction.override?.converter);

  // Then we create the handler
  const wrapper = await resolveWrapper(thisFunction.override?.wrapper);

  debug("Using wrapper", wrapper.name);

  return wrapper.wrapper(openNextHandler, adapter);
}
