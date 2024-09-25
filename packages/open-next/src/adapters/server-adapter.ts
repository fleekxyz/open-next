// We load every config here so that they are only loaded once
// and during cold starts

import * as fsPolyfill from "node:fs";

import { createMainHandler } from "../core/createMainHandler.js";
import { setNodeEnv } from "./util.js";

// We load every config here so that they are only loaded once
// and during cold starts
setNodeEnv();
setBuildIdEnv();

// Because next is messing with fetch, we have to make sure that we use an untouched version of fetch
declare global {
  var internalFetch: typeof fetch;
  var BuildId: string;
  var fs: typeof fsPolyfill;
}
globalThis.internalFetch = fetch;
globalThis.fs = fsPolyfill;

/////////////
// Handler //
/////////////

export const main = await createMainHandler();

//////////////////////
// Helper functions //
//////////////////////
function setBuildIdEnv() {
  // This allows users to access the CloudFront invalidating path when doing on-demand
  // invalidations. ie. `/_next/data/${process.env.NEXT_BUILD_ID}/foo.json`
  process.env.NEXT_BUILD_ID = globalThis.BuildId;
}
