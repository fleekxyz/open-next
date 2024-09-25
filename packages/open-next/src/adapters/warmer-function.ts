import { Warmer } from "types/open-next.js";

import { createGenericHandler } from "../core/createGenericHandler.js";
import { debug, error } from "./logger.js";
import { generateUniqueId } from "./util.js";
import { fleekWarmerEventConverter } from "../converters/fleek.js";

export interface WarmerEvent {
  type: "warmer";
  warmerId: string;
  index: number;
  concurrency: number;
  delay: number;
}

export interface WarmerResponse {
  type: "warmer";
}

const resolveWarmerInvoke = async () => {
  return Promise.resolve<Warmer>({
    name: "fleek-invoke",
    invoke: async (warmerId: string) => {
      const warmParams = JSON.parse(process.env.WARM_PARAMS!) as {
        concurrency: number;
        function: string;
      }[];

      for (const warmParam of warmParams) {
        const { concurrency: CONCURRENCY, function: FUNCTION_NAME } = warmParam;
        debug({
          event: "warmer invoked",
          functionName: FUNCTION_NAME,
          concurrency: CONCURRENCY,
          warmerId,
        });
        const ret = await Promise.all(
          Array.from({ length: CONCURRENCY }, (_v, i) => i).map(async (i) => {
            try {
              const ret = await fetch(`${FUNCTION_NAME}`, {
                method: "POST",
                body: JSON.stringify({
                  type: "warmer",
                  warmerId,
                  index: i,
                  concurrency: CONCURRENCY,
                  delay: 75,
                }),
              });

              return {
                status: ret.status,
                body: await ret.json(),
              };
            } catch (e) {
              error(`failed to warm up #${i}`, e);
              // ignore error
            }
          }),
        );

        // Print status

        const warmedServerIds = ret
          .map(async (r, i) => {
            if (r?.status !== 200 || !r?.body) {
              error(`failed to warm up #${i}:`, r?.body?.toString());
              return;
            }

            return {
              statusCode: r.status,
              payload: r.body,
              type: "warmer" as const,
            };
          })
          .filter((r): r is Exclude<typeof r, undefined> => !!r);

        debug({
          event: "warmer result",
          sent: CONCURRENCY,
          success: warmedServerIds.length,
          uniqueServersWarmed: [...new Set(warmedServerIds)].length,
        });
      }
    },
  });
};

export const main = await createGenericHandler({
  handler: defaultHandler,
  converter: fleekWarmerEventConverter,
  type: "warmer",
});

async function defaultHandler(): Promise<WarmerResponse> {
  const warmerId = `warmer-${generateUniqueId()}`;

  const invokeFn = await resolveWarmerInvoke();

  await invokeFn.invoke(warmerId);

  return {
    type: "warmer",
  };
}
