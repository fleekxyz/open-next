import { BaseOpenNextError } from "utils/error";

declare global {
  var openNextDebug: boolean;
}

export function debug(...args: any[]) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  console.warn(...args);
}

export function error(...args: any[]) {
  // we try to catch errors from the aws-sdk client and downplay some of them
  if (args.some((arg) => arg.__openNextInternal)) {
    // In case of an internal error, we log it with the appropriate log level
    const error = args.find(
      (arg) => arg.__openNextInternal,
    ) as BaseOpenNextError;
    if (error.logLevel === 0) {
      debug(...args);
      return;
    } else if (error.logLevel === 1) {
      warn(...args);
      return;
    } else {
      console.error(...args);
      return;
    }
  } else {
    console.error(...args);
  }
}

export const awsLogger = {
  trace: () => {},
  debug: () => {},
  info: debug,
  warn,
  error,
};
