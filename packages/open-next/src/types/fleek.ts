export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "DELETE"
  | "CONNECT"
  | "OPTIONS"
  | "TRACE"
  | "PATCH";

export type FleekRequest = {
  method: HttpMethod;
  headers?: Record<string, string>;
  path: string;
  query?: Record<string, string>;
  body: string;
};

export type FleekResponse = {
  status: number;
  headers: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: string | ReadableStream<any>;
};
