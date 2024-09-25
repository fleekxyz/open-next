import { mkdirSync } from "node:fs";
import url, { fileURLToPath } from "node:url";

import fs from "fs";
import path from "path";
import { MiddlewareInfo, MiddlewareManifest } from "types/next-types";
import {
  IncludedConverter,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

import {
  loadAppPathsManifestKeys,
  loadBuildId,
  loadConfig,
  loadConfigHeaders,
  loadHtmlPages,
  loadMiddlewareManifest,
  loadPrerenderManifest,
  // loadPublicAssets,
  loadRoutesManifest,
} from "../../adapters/config/util.js";
import logger from "../../logger.js";
import { openNextEdgePlugins } from "../../plugins/edge.js";
import { openNextReplacementPlugin } from "../../plugins/replacement.js";
import { BuildOptions, esbuildAsync } from "../helper.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

interface BuildEdgeBundleOptions {
  appBuildOutputPath: string;
  middlewareInfo: MiddlewareInfo;
  entrypoint: string;
  outfile: string;
  outputDir: string;
  options: BuildOptions;
  defaultConverter?: IncludedConverter;
  additionalInject?: string;
  includeCache?: boolean;
  openNextConfigPath: string;
}

export async function buildEdgeBundle({
  appBuildOutputPath,
  middlewareInfo,
  entrypoint,
  outfile,
  outputDir,
  options,
  additionalInject,
  includeCache,
  openNextConfigPath,
}: BuildEdgeBundleOptions) {
  const middlewarePath = path.join(outputDir, ".build", "middleware.mjs");

  const nextDir = path.join(appBuildOutputPath, ".next");
  const NextConfig = loadConfig(nextDir);
  const BuildId = loadBuildId(nextDir);
  const HtmlPages = loadHtmlPages(nextDir);
  const RoutesManifest = loadRoutesManifest(nextDir);
  const ConfigHeaders = loadConfigHeaders(nextDir);
  const PrerenderManifest = loadPrerenderManifest(nextDir);
  const AppPathsManifestKeys = loadAppPathsManifestKeys(nextDir);
  const MiddlewareManifest = loadMiddlewareManifest(nextDir);

  console.log("appBuildOutputPath", appBuildOutputPath);
  console.log("entrypoint", entrypoint);
  console.log("outfile", outfile);
  console.log("middlewarePath", middlewarePath);
  console.log("middlewareInfo", middlewareInfo);
  console.log("\n");

  await esbuildAsync(
    {
      entryPoints: [
        entrypoint,
        // ...middlewareInfo.files
      ],
      // inject: ,
      bundle: true,
      outfile,
      external: ["node:*"],
      // format: "esm",
      target: "es2022",
      platform: "neutral",
      conditions: ["module"],
      mainFields: ["browser", "module", "main"],
      treeShaking: true,
      alias: {
        path: "node:path",
        crypto: "node:crypto",
        "middleware-stub": middlewarePath,
      },
      plugins: [
        {
          name: "replace-async-local-storage",
          setup(build) {
            build.onResolve({ filter: /async_hooks/ }, (args) => {
              if (
                args.path === "async_hooks" ||
                args.path === "node:async_hooks"
              ) {
                return {
                  path: path.resolve(
                    path.dirname(fileURLToPath(import.meta.url)),
                    "polyfill",
                    "async_hooks.js",
                  ),
                  namespace: "replace-als",
                };
              }
            });

            build.onLoad(
              { filter: /.*/, namespace: "replace-als" },
              async (args) => {
                const contents = await fs.promises.readFile(args.path, "utf8");
                return {
                  contents,
                  loader: "js",
                };
              },
            );
          },
        },
        openNextReplacementPlugin({
          name: "externalMiddlewareOverrides",
          target: /adapters(\/|\\)middleware\.js/g,
          deletes: includeCache ? [] : ["includeCacheInMiddleware"],
        }),
        openNextEdgePlugins({
          middlewareInfo,
          nextDir: path.join(appBuildOutputPath, ".next"),
          edgeFunctionHandlerPath: path.join(
            __dirname,
            "../../core",
            "edgeFunctionHandler.js",
          ),
        }),
        {
          name: "replace-open-next-config",
          setup(build) {
            build.onResolve({ filter: /\.\/dummy\.config/ }, () => {
              return {
                path: openNextConfigPath,
                namespace: "replace-onc",
              };
            });

            build.onLoad(
              { filter: /.*/, namespace: "replace-onc" },
              async (args) => {
                const contents = fs.readFileSync(args.path, "utf-8");
                return {
                  contents,
                  loader: "js",
                };
              },
            );
          },
        },
        // moduleChecker({ unsupportedModulesUsed }),
        // nodeProtocolImportSpecifier({}),
      ],
      banner: {
        js: `
globalThis.NextConfig = ${JSON.stringify(NextConfig)};
globalThis.BuildId = ${JSON.stringify(BuildId)};
globalThis.HtmlPages = ${JSON.stringify(HtmlPages)};
globalThis.RoutesManifest = ${JSON.stringify(RoutesManifest)};
globalThis.ConfigHeaders = ${JSON.stringify(ConfigHeaders)};
globalThis.PrerenderManifest = ${JSON.stringify(PrerenderManifest)};
globalThis.AppPathsManifestKeys = ${JSON.stringify(AppPathsManifestKeys)};
globalThis.MiddlewareManifest = ${JSON.stringify(MiddlewareManifest)};
  globalThis.process = {
      env: {
        PORT: 80,
        NEXT_OTEL_FETCH_DISABLED: "true"
      }
  };
  ${additionalInject ?? ""}
  `,
      },
      define: {
        "process.env.VERCEL_ENV": '"production"',
        "process.env.VERCEL_BRANCH_URL": '"why?"',
        "process.env.VERCEL_PROJECT_PRODUCTION_URL": '"why?"',
        "process.env.PORT": '"80"',
        "process.env.NODE_ENV": '"production"',
        "process.env.NEXT_RUNTIME": '"edge"',
        "process.env.NEXT_PRIVATE_TEST_PROXY": '"false"',
        "process.env.MAX_REVALIDATE_CONCURRENCY": "10",
        "process.env.NEXT_OTEL_FETCH_DISABLED": '"true"',
        "process.env.NEXT_OTEL_VERBOSE": "0",
        "process.env.NEXT_PRIVATE_DEBUG_CACHE": '"false"',
        "process.env.SUSPENSE_CACHE_URL": '""',
        "process.env.SUSPENSE_CACHE_BASEPATH": '"/cache"',
        "process.env.SUSPENSE_CACHE_AUTH_TOKEN": '"foo"',
        "process.env.__NEXT_TEST_MAX_ISR_CACHE": "10",
        "process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT": "8080",
        "process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY": '"foo"',
        "process.env.OPEN_NEXT_FORCE_NON_EMPTY_RESPONSE": '"true"',
      },
    },
    options,
  );
}

export function copyMiddlewareAssetsAndWasm({}) {}

export async function generateEdgeBundle(
  name: string,
  options: BuildOptions,
  fnOptions: SplittedFunctionOptions,
) {
  const { appBuildOutputPath, outputDir } = options;
  logger.info(`Generating edge bundle for: ${name}`);

  // Create output folder
  const outputPath = path.join(outputDir, "server-functions", name);
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy open-next.config.mjs
  // copyOpenNextConfig(path.join(outputDir, ".build"), outputPath, true);
  const openNextConfigPath = path.join(
    outputDir,
    ".build",
    "open-next.config.mjs",
  );
  // Load middleware manifest
  const middlewareManifest = JSON.parse(
    fs.readFileSync(
      path.join(appBuildOutputPath, ".next/server/middleware-manifest.json"),
      "utf8",
    ),
  ) as MiddlewareManifest;

  // Find functions
  const functions = Object.values(middlewareManifest.functions).filter((fn) =>
    fnOptions.routes.includes(fn.name as RouteTemplate),
  );

  if (functions.length > 1) {
    throw new Error("Only one function is supported for now");
  }
  const fn = functions[0];

  //Copy wasm files
  try {
    const wasmFiles = fn.wasm;
    mkdirSync(path.join(outputPath, "wasm"), { recursive: true });
    for (const wasmFile of wasmFiles) {
      fs.copyFileSync(
        path.join(appBuildOutputPath, ".next", wasmFile.filePath),
        path.join(outputPath, `wasm/${wasmFile.name}.wasm`),
      );
    }
  } catch (error) {
    logger.info(`Failed to copy wasm files for: ${name}`);
    console.log(error);
  }

  // Copy assets
  try {
    const assets = fn.assets;
    mkdirSync(path.join(outputPath, "assets"), { recursive: true });
    for (const asset of assets) {
      fs.copyFileSync(
        path.join(appBuildOutputPath, ".next", asset.filePath),
        path.join(outputPath, `assets/${asset.name}`),
      );
    }
  } catch (error) {
    logger.info(`Failed to copy assets for: ${name}`);
    console.log(error);
  }

  await buildEdgeBundle({
    appBuildOutputPath,
    middlewareInfo: fn,
    entrypoint: path.join(__dirname, "../../adapters", "edge-adapter.js"),
    outfile: path.join(outputPath, "index.mjs"),
    outputDir,
    options,
    openNextConfigPath,
  });
}
