import type {
  BaseEventOrResult,
  Converter,
  InternalEvent,
  InternalResult,
  OpenNextHandler,
  WrapperHandler,
} from "types/open-next";

import { FleekRequest, FleekResponse } from "../../src/types/fleek";

export type FleekWrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
> = WrapperHandler<E, R>;

export async function fleekWrapper<
  E extends BaseEventOrResult = InternalEvent,
  R extends BaseEventOrResult = InternalResult,
>(handler: OpenNextHandler<E, R>, converter: Converter<E, R>) {
  return async (
    event: FleekRequest,
    env: Record<string, string>,
  ): Promise<FleekResponse> => {
    //@ts-expect-error - process is not defined in cloudflare workers
    globalThis.process = { env };
    const internalEvent = await converter.convertFrom(event);

    const response = await handler(internalEvent);

    const result: FleekResponse = await converter.convertTo(response);

    return result;
  };
}
