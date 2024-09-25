import { Redis } from "@upstash/redis/cloudflare";

import { TagCache } from "./types";

const { NEXT_BUILD_ID } = process.env;

const redis = new Redis({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_TOKEN,
});

function buildRedisKey(key: string) {
  return `${NEXT_BUILD_ID ?? ""}:${key}`;
}

const tagCache: TagCache = {
  async getByPath(path: string): Promise<string[]> {
    try {
      const key = buildRedisKey(`path:${path}`);
      const tags = await redis.smembers(key);
      console.debug("tags for path", path, tags);
      return tags.map((tag) => tag.replace(`${NEXT_BUILD_ID}:`, ""));
    } catch (e) {
      console.error("Failed to get tags by path", e);
      return [];
    }
  },

  async getByTag(tag: string): Promise<string[]> {
    try {
      const key = buildRedisKey(`tag:${tag}`);
      const paths = await redis.smembers(key);
      return paths.map((path) => path.replace(`${NEXT_BUILD_ID}:`, ""));
    } catch (e) {
      console.error("Failed to get by tag", e);
      return [];
    }
  },

  async getLastModified(key: string, lastModified?: number): Promise<number> {
    try {
      const revalidatedKey = buildRedisKey(`revalidated:${key}`);
      const revalidatedAt = await redis.get<number>(revalidatedKey);
      if (revalidatedAt && revalidatedAt > (lastModified ?? 0)) {
        return -1;
      }
      return lastModified ?? Date.now();
    } catch (e) {
      console.error("Failed to get last modified", e);
      return lastModified ?? Date.now();
    }
  },

  async writeTags(
    tags: { path: string; tag: string; revalidatedAt?: number }[],
  ): Promise<void> {
    try {
      const pipeline = redis.pipeline();
      for (const { path, tag, revalidatedAt } of tags) {
        const pathKey = buildRedisKey(`path:${path}`);
        const tagKey = buildRedisKey(`tag:${tag}`);
        const revalidatedKey = buildRedisKey(`revalidated:${path}`);

        pipeline.sadd(pathKey, tag);
        pipeline.sadd(tagKey, path);
        pipeline.set(revalidatedKey, revalidatedAt ?? Date.now());
      }
      await pipeline.exec();
    } catch (e) {
      console.error("Failed to write tags", e);
    }
  },

  name: "upstashRedis",
};

export default tagCache;
