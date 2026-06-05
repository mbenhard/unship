import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

export const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".unship",
  ".superpowers",
  "coverage",
  ".cache",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build"
]);

export const BUILD_DIRS = new Set(["dist", "build", ".next", ".nuxt", ".svelte-kit"]);

export async function* walkProjectFiles({
  root = process.cwd(),
  extensions,
  includeBuild = false,
  ignores = DEFAULT_IGNORES,
  strict = false
} = {}) {
  for await (const file of walk(root, { includeBuild, ignores, strict })) {
    if (!extensions || extensions.has(extension(file))) {
      yield { file, rel: toPosix(relative(root, file)) };
    }
  }
}

async function* walk(dir, options) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    if (options.strict) throw new Error(`Cannot read project directory: ${dir}`);
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name, options)) continue;
      yield* walk(full, options);
      continue;
    }

    if (entry.isFile()) yield full;
  }
}

function shouldIgnoreDirectory(name, { includeBuild, ignores }) {
  if (includeBuild && BUILD_DIRS.has(name)) return false;
  return ignores.has(name);
}

export function extension(path) {
  return extname(path);
}

export function toPosix(path) {
  return path.split(sep).join("/");
}
