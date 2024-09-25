import path from "node:path";
import url from "node:url";

import { debug } from "../logger.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
export const NEXT_DIR = path.join(__dirname, ".next");
export const OPEN_NEXT_DIR = path.join(__dirname, ".open-next");

debug({ NEXT_DIR, OPEN_NEXT_DIR });

//TODO: inject these values at build time
// export const PublicAssets = loadPublicAssets(OPEN_NEXT_DIR);
