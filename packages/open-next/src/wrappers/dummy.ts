import type {
  InternalEvent,
  InternalResult,
  WrapperHandler,
} from "types/open-next";

const handler: WrapperHandler<InternalEvent, InternalResult> =
  async (handler, converter) =>
  async (event: Request, env: Record<string, string>): Promise<Response> => {
    //@ts-expect-error - process is not defined in cloudflare workers
    globalThis.process = { env };
    const internalEvent = await converter.convertFrom(event);
    const response = await handler(internalEvent);
    const result: Response = converter.convertTo(response);
    return result;
  };

export default {
  wrapper: handler,
  name: "dummy",
  supportStreaming: true,
};
