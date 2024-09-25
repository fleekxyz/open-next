import type {
  BaseEventOrResult,
  Converter,
  InternalEvent,
  InternalResult,
  OpenNextConfig,
  OpenNextHandler,
} from "types/open-next";

import { fleekWrapper } from "../wrappers/fleek";
import openNextConfig from "./dummy.config";

declare global {
  var openNextConfig: Partial<OpenNextConfig>;
}

type HandlerType =
  | "imageOptimization"
  | "revalidate"
  | "warmer"
  | "middleware"
  | "initializationFunction";

type GenericHandler<
  Type extends HandlerType,
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = {
  handler: OpenNextHandler<E, R>;
  converter: Converter<E, R>;
  type: Type;
};

export async function createGenericHandler<
  Type extends HandlerType,
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(handler: GenericHandler<Type, E, R>) {
  const config: OpenNextConfig = openNextConfig as OpenNextConfig;

  globalThis.openNextConfig = config;

  // Then we create the handler
  return fleekWrapper<E, R>(handler.handler, handler.converter);
}
