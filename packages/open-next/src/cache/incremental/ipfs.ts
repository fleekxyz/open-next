import { Redis } from "@upstash/redis";
import { ShardingStream, UnixFS } from "@web3-storage/upload-client";
import { Block } from "@web3-storage/upload-client/car";
import { FileLike } from "@web3-storage/upload-client/types";
import { base32 } from "multiformats/bases/base32";
import { Parallel } from "parallel-transform-web";

import { Extension } from "../next-types";
import { IncrementalCache } from "./types";

const {
  FLEEK_PAT,
  FLEEK_UPLOAD_PROXY_URL,
  FLEEK_NETWORK_URL,
  UPSTASH_URL,
  UPSTASH_TOKEN,
  NEXT_BUILD_ID,
} = process.env;

const shardSize = 10_485_760;
const uploadConcurrency = 3;

export type UploadFileArgs = {
  file: FileLike;
};

export type UploadPinResponse = {
  pin: { cid: string; size: number };
  duplicate: boolean;
};

export type UploadContentArgs = {
  getStream: () => ReadableStream<Block>;
  basename: string;
};

export type GetStreamCidAndTotalSizeArgs = {
  getStream: () => ReadableStream<Block>;
};

export type CheckPinDuplicityArgs = { cid: string };

// Initialize Upstash Redis client
const redis = new Redis({
  url: UPSTASH_URL!,
  token: UPSTASH_TOKEN!,
});

function buildRedisKey(key: string, extension: Extension) {
  return `${NEXT_BUILD_ID}:${extension}:${key}`;
}

const incrementalCache: IncrementalCache = {
  async get(key, isFetch) {
    try {
      const redisKey = buildRedisKey(key, isFetch ? "fetch" : "cache");
      const cid = await redis.get(redisKey);

      if (!cid) {
        throw new Error("Not found");
      }

      const url = new URL(FLEEK_NETWORK_URL ?? "");
      url.pathname = `services/0/ipfs/${cid}`;

      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status}`);
      }

      const content = await response.text();
      const cacheData = JSON.parse(content);

      const lastModified = await redis.get(`${redisKey}:lastModified`);

      return {
        value: cacheData,
        lastModified: lastModified
          ? parseInt(lastModified as string, 10)
          : Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to get cache: ${error}`);
    }
  },

  async set(key, value, isFetch): Promise<void> {
    try {
      const redisKey = buildRedisKey(key, isFetch ? "fetch" : "cache");
      const content = JSON.stringify(value);

      const file = new File([content], key, { type: "application/json" });
      const {
        pin: { cid },
      } = await uploadFile({ file });

      await redis.set(redisKey, cid);
      await redis.set(`${redisKey}:lastModified`, Date.now().toString());
    } catch (error) {
      throw new Error(`Failed to set cache: ${error}`);
    }
  },

  async delete(key): Promise<void> {
    try {
      const redisKey = buildRedisKey(key, "cache");
      await redis.del(redisKey);
      await redis.del(`${redisKey}:lastModified`);
    } catch (error) {
      throw new Error(`Failed to delete cache: ${error}`);
    }
  },

  name: "ipfs-upstash",
};

export const uploadFile = async ({
  file,
}: UploadFileArgs): Promise<UploadPinResponse> => {
  const getStream = () => UnixFS.createFileEncoderStream(file);

  return uploadContent({
    getStream,
    basename: file.name,
  });
};

export const uploadContent = async ({
  getStream,
  basename,
}: UploadContentArgs): Promise<UploadPinResponse> => {
  const { cid, totalSize } = await getStreamCidAndTotalSize({ getStream });

  const isDuplicity = await checkPinDuplicity({ cid });

  if (isDuplicity) {
    return { pin: { cid, size: totalSize }, duplicate: true };
  }

  const shardCids: string[] = [];

  const fetchWithValidStatus = async (req: Request, validStatuses = [200]) => {
    const response = await fetch(req);

    if (!validStatuses.includes(response.status)) {
      if (response.status === 429) {
        const error = await response
          .json()
          ?.then((res) => res.errors[0])
          .catch((err) => {
            console.warn("Unexpected response with 429 status", err);
            throw new Error("Unknown");
          });

        if (error.code === "DailyUploadedTotalSizeQuotaExceeded") {
          throw new Error("StorageUploadTotalSizeQuotaExceededError");
        } else if (error.code === "DailyUploadedFilesQuotaExceeded") {
          throw new Error("StorageUploadFileCountQuotaExceededError");
        } else {
          console.warn("Error Code missing for 429");
          throw new Error("Unknown");
        }
      } else {
        throw new Error("StorageIpfsUploadFailedError");
      }
    }

    return response;
  };

  await getStream()
    .pipeThrough(new ShardingStream({ shardSize }))
    .pipeThrough(
      new Parallel(uploadConcurrency, async (car) => {
        const url = new URL(FLEEK_UPLOAD_PROXY_URL ?? "");
        url.pathname = "store";

        const body = new Uint8Array(await car.arrayBuffer());

        const response = await retry({
          fn: async () =>
            fetchWithValidStatus(
              new Request(url, {
                method: "POST",
                body,
                headers: {
                  "Content-Type": "application/vnd.ipld.car",
                  Authorization: `Bearer ${FLEEK_PAT}`,
                },
              }),
            ),
          tries: 3,
          intervalMs: 3_000,
        });

        return { cid: await response.text(), size: body.byteLength };
      }),
    )
    .pipeTo(
      new WritableStream({
        write: async ({ cid }: { cid: string; size: number }) => {
          shardCids.push(cid);
        },
      }),
    );

  const url = new URL(FLEEK_UPLOAD_PROXY_URL ?? "");
  url.pathname = "upload";

  const body = JSON.stringify({ basename, totalSize, rootCid: cid, shardCids });

  await retry({
    fn: async () =>
      fetchWithValidStatus(
        new Request(url, {
          method: "POST",
          body,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${FLEEK_PAT}`,
          },
        }),
      ),
    tries: 3,
    intervalMs: 3_000,
  });

  return { pin: { cid, size: totalSize }, duplicate: false };
};

const checkPinDuplicity = async ({ cid }: CheckPinDuplicityArgs) => {
  const url = new URL(FLEEK_UPLOAD_PROXY_URL ?? "");
  url.pathname = `duplicity/${cid}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${FLEEK_PAT}`,
    },
  });

  return response.status === 409;
};

const getStreamCidAndTotalSize = async ({
  getStream,
}: GetStreamCidAndTotalSizeArgs) => {
  let totalSize = 0;
  let cid: string | undefined;

  await getStream()
    .pipeThrough(new ShardingStream({ shardSize }))
    .pipeTo(
      new WritableStream({
        write: (car) => {
          if (car.roots[0]) {
            cid = car.roots[0].toV1().toString(base32);
          }

          totalSize += car.size;
        },
      }),
    );

  if (!cid) {
    throw new Error("StorageIpfsUploadFailedError");
  }

  return { cid, totalSize };
};

export type RetryArgs<T> = {
  fn: () => Promise<T>;
  tries: number;
  intervalMs: number;
};

export const retry = async <T>({
  fn,
  tries,
  intervalMs,
}: RetryArgs<T>): Promise<T> => {
  let n = 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (n === tries) {
        throw error;
      }

      console.warn(
        "Error caught",
        error,
        `${n}/${tries} try, will wait for ${intervalMs}ms`,
      );

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      n++;
    }
  }
};

export default incrementalCache;
