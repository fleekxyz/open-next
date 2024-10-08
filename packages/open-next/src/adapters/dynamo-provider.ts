import { readFileSync } from "fs";

import upstashTagCache from "../cache/tag/upstash";
import { fleekInitializationFunctionEventConverter } from "../converters/fleek.js";
import { createGenericHandler } from "../core/createGenericHandler.js";

const PHYSICAL_RESOURCE_ID = "dynamodb-cache" as const;

//TODO: modify this, we should use the same format as the cache
type DataType = {
  tag: {
    S: string;
  };
  path: {
    S: string;
  };
  revalidatedAt: {
    N: string;
  };
};

export interface InitializationFunctionEvent {
  type: "initializationFunction";
  requestType: "create" | "update" | "delete";
  resourceId: typeof PHYSICAL_RESOURCE_ID;
}

const tagCache = upstashTagCache;

export const main = await createGenericHandler({
  handler: defaultHandler,
  converter: fleekInitializationFunctionEventConverter,
  type: "initializationFunction",
});

async function defaultHandler(
  event: InitializationFunctionEvent,
): Promise<InitializationFunctionEvent> {
  switch (event.requestType) {
    case "delete":
      return remove();
    case "create":
    case "update":
    default:
      return insert(event.requestType);
  }
}

async function insert(
  requestType: InitializationFunctionEvent["requestType"],
): Promise<InitializationFunctionEvent> {
  const file = readFileSync(`dynamodb-cache.json`, "utf8");

  const data: DataType[] = JSON.parse(file);

  const parsedData = data.map((item) => ({
    tag: item.tag.S,
    path: item.path.S,
    revalidatedAt: parseInt(item.revalidatedAt.N),
  }));

  await tagCache.writeTags(parsedData);

  return {
    type: "initializationFunction",
    requestType,
    resourceId: PHYSICAL_RESOURCE_ID,
  };
}

async function remove(): Promise<InitializationFunctionEvent> {
  // Do we want to actually delete anything here?
  return {
    type: "initializationFunction",
    requestType: "delete",
    resourceId: PHYSICAL_RESOURCE_ID,
  };
}
