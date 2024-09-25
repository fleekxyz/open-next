export function fromReadableStream(
  stream: ReadableStream<Uint8Array>,
  base64?: boolean,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    function pump() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(chunks).toString(base64 ? "base64" : "utf8"));
            return;
          }
          chunks.push(value);
          pump();
        })
        .catch(reject);
    }
    pump();
  });
}

export function toReadableStream(
  value: string,
  isBase64?: boolean,
): ReadableStream {
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from(value, isBase64 ? "base64" : "utf8"));
      controller.close();
    },
  });

  return readable;
}

export function emptyReadableStream(): ReadableStream {
  const readable = new ReadableStream({
    start(controller) {
      if (process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE === "true") {
        controller.enqueue(Buffer.from("SOMETHING"));
      } else {
        controller.enqueue([]);
      }
      controller.close();
    },
  });

  return readable;
}
