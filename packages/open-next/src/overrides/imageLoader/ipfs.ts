import { Readable } from "node:stream";

import { ImageLoader } from "../../types/open-next";

function convertToNodeReadable(
  webReadableStream: ReadableStream<Uint8Array>,
): Readable {
  return new Readable({
    async read(_size) {
      const reader = webReadableStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
            return;
          }
          if (!this.push(Buffer.from(value))) {
            reader.releaseLock();
            return;
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          this.destroy(err);
        } else {
          this.destroy(new Error("Unknown error"));
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

const hostLoader: ImageLoader = {
  name: "host",
  load: async (key: string) => {
    const host = process.env.IPFS_STATIC_ASSETS_HOST;
    if (!host) {
      throw new Error("Host must be defined!");
    }
    const url = `https://${host}${key}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from ${url}`);
    }
    if (!response.body) {
      throw new Error("No body in response");
    }
    const body = convertToNodeReadable(response.body);
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const cacheControl =
      response.headers.get("cache-control") ??
      "private, max-age=0, must-revalidate";
    return {
      body,
      contentType,
      cacheControl,
    };
  },
};

export default hostLoader;
