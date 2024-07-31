import { mkdirSync } from "node:fs";
import url, { fileURLToPath } from "node:url";

import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import fs from "fs";
import path from "path";
import { MiddlewareInfo, MiddlewareManifest } from "types/next-types";
import {
  DefaultOverrideOptions,
  IncludedConverter,
  RouteTemplate,
  SplittedFunctionOptions,
} from "types/open-next";

import logger from "../../logger.js";
import { openNextEdgePlugins } from "../../plugins/edge.js";
import { openNextResolvePlugin } from "../../plugins/resolve.js";
import { BuildOptions, esbuildAsync } from "../helper.js";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));

interface BuildEdgeBundleOptions {
  appBuildOutputPath: string;
  middlewareInfo: MiddlewareInfo;
  entrypoint: string;
  outfile: string;
  options: BuildOptions;
  overrides?: DefaultOverrideOptions;
  defaultConverter?: IncludedConverter;
  additionalInject?: string;
  openNextConfigPath: string;
}

export async function buildEdgeBundle({
  appBuildOutputPath,
  middlewareInfo,
  entrypoint,
  outfile,
  options,
  defaultConverter,
  overrides,
  additionalInject,
  openNextConfigPath,
}: BuildEdgeBundleOptions) {
  await esbuildAsync(
    {
      entryPoints: [entrypoint],
      // inject: ,
      bundle: true,
      outfile,
      external: ["node:*", "next", "@aws-sdk/*"],
      target: "es2022",
      platform: "neutral",
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
        openNextResolvePlugin({
          overrides: {
            wrapper: overrides?.wrapper ?? "aws-lambda",
            converter: overrides?.converter ?? defaultConverter,
          },
        }),
        openNextEdgePlugins({
          middlewareInfo,
          nextDir: path.join(appBuildOutputPath, ".next"),
          edgeFunctionHandlerPath: path.join(
            __dirname,
            "../../core",
            "edgeFunctionHandler.js",
          ),
          useFilesystem:
            overrides?.wrapper === "cloudflare" ||
            typeof overrides?.wrapper === "function",
        }),
        nodeModulesPolyfillPlugin({
          globals: {
            Buffer: true,
          },
          // fallback: "empty",
          modules: {
            async_hooks: false,
            buffer: true,
            path: true,
            stream: true,
            zlib: true,
            crypto: true,
            https: true,
          },
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
                const contents = await fs.readFileSync(args.path, "utf-8");
                return {
                  contents,
                  loader: "js",
                };
              },
            );
          },
        },
      ],
      treeShaking: true,
      conditions: ["module"],
      mainFields: ["module", "main"],
      banner: {
        js: `
  ${
    overrides?.wrapper === "cloudflare" ||
    typeof overrides?.wrapper === "function"
      ? ""
      : `
  const require = (await import("node:module")).createRequire(import.meta.url);
  const __filename = (await import("node:url")).fileURLToPath(import.meta.url);
  const __dirname = (await import("node:path")).dirname(__filename);
  `
  }
  ${additionalInject ?? ""}
  `,
      },
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.NEXT_RUNTIME": '"edge"',
        "process.env.NEXT_PRIVATE_TEST_PROXY": '"false"',
        "process.env.MAX_REVALIDATE_CONCURRENCY": "10",
        "process.env.NEXT_OTEL_VERBOSE": "0",
        "process.env.NEXT_PRIVATE_DEBUG_CACHE": '"false"',
        "process.env.SUSPENSE_CACHE_URL": '"http://foo.com"',
        "process.env.SUSPENSE_CACHE_BASEPATH": '"/cache"',
        "process.env.SUSPENSE_CACHE_AUTH_TOKEN": '"foo"',
        "process.env.SUSPENSE_CACHE_PROTO": '"false"',
        "process.env.__NEXT_TEST_MAX_ISR_CACHE": "10",
        "process.env.__NEXT_INCREMENTAL_CACHE_IPC_PORT": "8080",
        "process.env.__NEXT_INCREMENTAL_CACHE_IPC_KEY": '"foo"',
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
    options,
    overrides: fnOptions.override,
    openNextConfigPath,
  });
}
