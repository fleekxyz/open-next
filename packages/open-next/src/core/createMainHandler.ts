// import type { AsyncLocalStorage } from "node:async_hooks";

// import { DetachedPromiseRunner } from "utils/promise";
// import { debug } from "../adapters/logger";
import { generateUniqueId } from "../adapters/util";
// import ipfsIncrementalCache from "../cache/incremental/ipfs";
import type { IncrementalCache } from "../cache/incremental/types";
import upstashTagCache from "../cache/tag/upstash";
import { fleekInternalEventConverter } from "../converters/fleek";
import fleekQueue from "../queue/fleek";
import type { Queue } from "../queue/types";
import { fleekWrapper } from "../wrappers/fleek";
import openNextConfig from "./dummy.config";
import { openNextHandler } from "./requestHandler.js";

declare global {
  var queue: Queue;
  var incrementalCache: IncrementalCache;
  var fnName: string | undefined;
  var serverId: string;
}

export async function createMainHandler() {
  //First we load the config
  globalThis.serverId = generateUniqueId();
  globalThis.openNextConfig = openNextConfig;

  // Default queue
  globalThis.queue = fleekQueue;
  globalThis.tagCache = upstashTagCache;

  globalThis.lastModified = {};

  // From the config, we create the adapter
  const adapter = fleekInternalEventConverter;

  return fleekWrapper(openNextHandler, adapter);
}
