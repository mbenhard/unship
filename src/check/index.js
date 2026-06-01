import { readdir, readFile } from "node:fs/promises";
import { relative, sep } from "node:path";

const DEFAULT_IGNORES = new Set([
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

const BUILD_DIRS = new Set(["dist", "build", ".next", ".nuxt", ".svelte-kit"]);
const EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".mdx", ".liquid", ".hbs", ".handlebars", ".njk", ".ejs"]);
const PATTERNS = ["data-unship-pick", "data-unship-option", "unship-picker", "<!-- unship"];

const ALLOWED_PATHS = [
  /^docs\//,
  /^agent\/skills\/unship\/SKILL\.md$/,
  /^\.agents\/skills\/unship\/SKILL\.md$/,
  /^\.claude\/skills\/unship\/SKILL\.md$/,
  /^\.opencode\/skills\/unship\/SKILL\.md$/,
  /^\.opencode\/commands\/unship\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/
];

export async function checkUnshipResidue({ root = process.cwd(), includeBuild = false } = {}) {
  const diagnostics = [];
  for await (const file of walk(root, { includeBuild })) {
    const rel = toPosix(relative(root, file));
    if (isAllowedDocumentation(rel)) continue;
    const text = await readFile(file, "utf8");
    diagnostics.push(...scanText(rel, text));
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function scanText(file, text) {
  const diagnostics = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const pattern of PATTERNS) {
      const column = lineText.indexOf(pattern);
      if (column !== -1) {
        diagnostics.push({
          file,
          line: index + 1,
          column: column + 1,
          pattern,
          message: "Remove temporary Unship picker markup before shipping."
        });
      }
    }
  });
  return diagnostics;
}

async function* walk(dir, options) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name, options)) continue;
      yield* walk(full, options);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXTENSIONS.has(extension(entry.name))) yield full;
  }
}

function shouldIgnoreDirectory(name, { includeBuild }) {
  if (includeBuild && BUILD_DIRS.has(name)) return false;
  return DEFAULT_IGNORES.has(name);
}

function isAllowedDocumentation(rel) {
  return ALLOWED_PATHS.some((pattern) => pattern.test(rel));
}

function extension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}
