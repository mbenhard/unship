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
const PICK_ATTR = "data-unship-pick";
const OPTION_ATTR = "data-unship-option";
const MAX_RANGE_LINES = 200;

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
  const explorations = [];
  for await (const file of walk(root, { includeBuild })) {
    const rel = toPosix(relative(root, file));
    if (isAllowedDocumentation(rel)) continue;
    const text = await readFile(file, "utf8");
    diagnostics.push(...scanText(rel, text));
    explorations.push(...scanExplorations(rel, text));
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    explorations,
    cleanupRequired: diagnostics.length > 0
  };
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

export function scanExplorations(file, text) {
  const lines = text.split(/\r?\n/);
  const groups = [];

  lines.forEach((lineText, index) => {
    if (!lineText.includes(PICK_ATTR)) return;

    const tag = tagNameForAttribute(lineText, PICK_ATTR);
    const range = findElementRange(lines, index, tag);
    groups.push({
      pick: attributeValues(lineText, PICK_ATTR, groups.length + 1)[0]?.value || `Group ${groups.length + 1}`,
      file,
      startLine: index + 1,
      endLine: range.endLine,
      rangeConfidence: range.confidence,
      rangeStartIndex: index,
      rangeEndIndex: range.endIndex
    });
  });

  return groups.map((group) => {
    const nestedRanges = groups
      .filter((candidate) => candidate.startLine > group.startLine && candidate.rangeEndIndex <= group.rangeEndIndex)
      .map((candidate) => [candidate.rangeStartIndex, candidate.rangeEndIndex]);
    const options = collectOptionLabels(lines, group.rangeStartIndex, group.rangeEndIndex, nestedRanges, group.rangeConfidence);

    return {
      pick: group.pick,
      file: group.file,
      options: options.options,
      uncertainOptions: options.uncertainOptions,
      startLine: group.startLine,
      ...(group.endLine ? { endLine: group.endLine } : {}),
      rangeConfidence: group.rangeConfidence
    };
  });
}

function tagNameForAttribute(lineText, attr) {
  const index = lineText.indexOf(attr);
  const before = index === -1 ? "" : lineText.slice(0, index);
  const withoutExpressions = stripJsxExpressions(before);
  const matches = Array.from(withoutExpressions.matchAll(/<([A-Za-z][\w:.-]*)\b/g));
  return matches.at(-1)?.[1] || null;
}

function findElementRange(lines, startIndex, tag) {
  const fallbackEnd = Math.min(lines.length - 1, startIndex + MAX_RANGE_LINES);
  if (!tag) return { endLine: null, endIndex: fallbackEnd, confidence: "low" };

  let depth = 0;
  for (let index = startIndex; index <= fallbackEnd; index += 1) {
    depth += tagDelta(lines[index], tag);
    if (depth <= 0) return { endLine: index + 1, endIndex: index, confidence: "high" };
  }
  return { endLine: null, endIndex: fallbackEnd, confidence: "low" };
}

function tagDelta(lineText, tag) {
  let delta = 0;
  const escaped = escapeRegExp(tag);
  const token = new RegExp(`</?${escaped}\\b[^>]*>`, "g");
  for (const match of stripJsxExpressions(lineText).matchAll(token)) {
    const value = match[0];
    if (value.startsWith("</")) delta -= 1;
    else if (!value.endsWith("/>")) delta += 1;
  }
  return delta;
}

function collectOptionLabels(lines, startIndex, endIndex, nestedRanges, rangeConfidence) {
  const options = [];
  const uncertainOptions = [];
  let bareCount = 0;
  let depth = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    if (isInsideNestedRange(index, nestedRanges)) {
      depth += markupDelta(lines[index]);
      continue;
    }

    for (const value of attributeValues(lines[index], OPTION_ATTR, bareCount + 1)) {
      if (value.bare) bareCount += 1;
      const depthAtAttribute = depth + markupDelta(lines[index].slice(0, value.index));
      if (rangeConfidence !== "high" || value.kind !== "literal" || depthAtAttribute !== 1) uncertainOptions.push(value.value);
      else options.push(value.value);
    }
    depth += markupDelta(lines[index]);
  }

  return { options, uncertainOptions };
}

function attributeValues(lineText, attr, bareIndex = 1) {
  const values = [];
  const escaped = escapeRegExp(attr);
  const regex = new RegExp(`${escaped}(?=\\s|=|>|\\/|$)(?:\\s*=\\s*("([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\}|\\{\\s*([^}]+?)\\s*\\}))?`, "g");
  let match;

  while ((match = regex.exec(lineText))) {
    const full = match[0];
    if (full.includes("=")) {
      const literal = match[2] ?? match[3] ?? match[4] ?? match[5];
      if (literal !== undefined) values.push({ kind: "literal", value: literal || `Option ${bareIndex}`, bare: false, index: match.index });
      else values.push({ kind: "dynamic", value: (match[6] || "dynamic").trim(), bare: false, index: match.index });
    } else {
      values.push({ kind: "literal", value: `Option ${bareIndex}`, bare: true, index: match.index });
    }
  }

  return values;
}

function markupDelta(fragment) {
  let delta = 0;
  const token = /<\/?[A-Za-z][\w:.-]*\b[^>]*>/g;
  for (const match of stripJsxExpressions(fragment).matchAll(token)) {
    const value = match[0];
    if (value.startsWith("</")) delta -= 1;
    else if (!value.endsWith("/>")) delta += 1;
  }
  return delta;
}

function stripJsxExpressions(value) {
  return value.replace(/\{[^{}]*\}/g, "");
}

function isInsideNestedRange(index, ranges) {
  return ranges.some(([start, end]) => index >= start && index <= end);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
