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
  const summary = summarizeCleanup({ diagnostics, explorations });
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    explorations,
    summary,
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
  const lineStarts = lineStartOffsets(text);
  const groups = [];
  const pickRegex = attributePresenceRegex(PICK_ATTR);
  let match;

  while ((match = pickRegex.exec(text))) {
    const element = elementForAttribute(text, match.index, lineStarts);
    const range = findElementRange(text, lineStarts, element.startOffset, element.tag);
    groups.push({
      pick: attributeValueAt(text, match.index, PICK_ATTR, groups.length + 1)?.value || `Group ${groups.length + 1}`,
      file,
      startLine: lineIndexForOffset(lineStarts, element.startOffset) + 1,
      endLine: range.endLine,
      rangeConfidence: range.confidence,
      rangeStartOffset: element.startOffset,
      rangeEndOffset: range.endOffset
    });
  }

  return groups.map((group) => {
    const nestedRanges = groups
      .filter((candidate) => candidate.rangeStartOffset > group.rangeStartOffset && candidate.rangeEndOffset <= group.rangeEndOffset)
      .map((candidate) => [candidate.rangeStartOffset, candidate.rangeEndOffset]);
    const options = collectOptionLabels(text, group.rangeStartOffset, group.rangeEndOffset, nestedRanges, group.rangeConfidence);

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

export function summarizeCleanup({ diagnostics = [], explorations = [] } = {}) {
  const files = [...new Set(diagnostics.map((item) => item.file))].sort();
  const artifactCount = diagnostics.length;
  const fileCount = files.length;
  const explorationCount = explorations.length;
  return {
    artifactCount,
    fileCount,
    explorationCount,
    files,
    message: artifactCount
      ? `Unship cleanup required: ${artifactCount} ${plural("artifact", artifactCount)} across ${fileCount} ${plural("file", fileCount)}.`
      : "No Unship preview artifacts found."
  };
}

function plural(word, count) {
  return count === 1 ? word : `${word}s`;
}

function elementForAttribute(text, attrOffset, lineStarts) {
  const safeText = blankJsxExpressions(text);
  const tagStart = safeText.lastIndexOf("<", attrOffset);
  const tagEnd = safeText.lastIndexOf(">", attrOffset);
  if (tagStart !== -1 && tagStart > tagEnd) {
    const match = safeText.slice(tagStart, attrOffset).match(/^<([A-Za-z][\w:.-]*)\b/);
    if (match) return { tag: match[1], startOffset: tagStart };
  }

  const lineIndex = lineIndexForOffset(lineStarts, attrOffset);
  return { tag: null, startOffset: lineStarts[lineIndex] };
}

function findElementRange(text, lineStarts, startOffset, tag) {
  const startLineIndex = lineIndexForOffset(lineStarts, startOffset);
  const fallbackLineIndex = Math.min(lineStarts.length - 1, startLineIndex + MAX_RANGE_LINES);
  const fallbackEndOffset = fallbackLineIndex + 1 < lineStarts.length ? lineStarts[fallbackLineIndex + 1] : text.length;
  if (!tag) return { endLine: null, endOffset: fallbackEndOffset, confidence: "low" };

  let depth = 0;
  let opened = false;
  const escaped = escapeRegExp(tag);
  const token = new RegExp(`</?${escaped}\\b[^>]*>`, "gs");
  const source = blankJsxExpressions(text.slice(startOffset, fallbackEndOffset));

  for (const match of source.matchAll(token)) {
    const value = match[0];
    const endOffset = startOffset + match.index + value.length;
    if (value.startsWith("</")) depth -= 1;
    else if (value.endsWith("/>")) {
      if (!opened) return { endLine: lineIndexForOffset(lineStarts, endOffset - 1) + 1, endOffset, confidence: "high" };
    } else {
      depth += 1;
      opened = true;
    }
    if (opened && depth <= 0) return { endLine: lineIndexForOffset(lineStarts, endOffset - 1) + 1, endOffset, confidence: "high" };
  }
  return { endLine: null, endOffset: fallbackEndOffset, confidence: "low" };
}

function collectOptionLabels(text, startOffset, endOffset, nestedRanges, rangeConfidence) {
  const options = [];
  const uncertainOptions = [];
  let bareCount = 0;
  const optionRegex = attributePresenceRegex(OPTION_ATTR);
  optionRegex.lastIndex = startOffset;

  let match;
  while ((match = optionRegex.exec(text)) && match.index < endOffset) {
    if (isInsideRange(match.index, nestedRanges)) continue;

    const value = attributeValueAt(text, match.index, OPTION_ATTR, bareCount + 1);
    if (!value) continue;
    if (value.bare) bareCount += 1;
    const depthAtAttribute = depthAtOffset(text, startOffset, match.index);
    if (rangeConfidence !== "high" || value.kind !== "literal" || depthAtAttribute !== 1) uncertainOptions.push(value.value);
    else options.push(value.value);
  }

  return { options, uncertainOptions };
}

function attributeValueAt(text, offset, attr, bareIndex = 1) {
  const escaped = escapeRegExp(attr);
  const regex = new RegExp(`^${escaped}(?=\\s|=|>|\\/|$)(?:\\s*=\\s*("([^"]*)"|'([^']*)'|\\{\\s*"([^"]*)"\\s*\\}|\\{\\s*'([^']*)'\\s*\\}|\\{\\s*([^}]+?)\\s*\\}))?`, "s");
  const match = regex.exec(text.slice(offset));
  if (!match) return null;

  if (match[0].includes("=")) {
    const literal = match[2] ?? match[3] ?? match[4] ?? match[5];
    if (literal !== undefined) return { kind: "literal", value: literal || `Option ${bareIndex}`, bare: false };
    return { kind: "dynamic", value: (match[6] || "dynamic").trim(), bare: false };
  }

  return { kind: "literal", value: `Option ${bareIndex}`, bare: true };
}

function depthAtOffset(text, startOffset, offset) {
  let depth = 0;
  const token = /<\/?[A-Za-z][\w:.-]*\b[^>]*>/gs;
  for (const match of blankJsxExpressions(text.slice(startOffset, offset)).matchAll(token)) {
    const value = match[0];
    if (value.startsWith("</")) depth -= 1;
    else if (!value.endsWith("/>")) depth += 1;
  }
  return depth;
}

function attributePresenceRegex(attr) {
  return new RegExp(`${escapeRegExp(attr)}(?=\\s|=|>|\\/|$)`, "g");
}

function lineStartOffsets(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineIndexForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset && (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset)) return mid;
    if (lineStarts[mid] > offset) high = mid - 1;
    else low = mid + 1;
  }
  return lineStarts.length - 1;
}

function blankJsxExpressions(value) {
  let output = "";
  let braceDepth = 0;
  let quote = null;
  let escaped = false;

  for (const char of value) {
    const startsExpression = braceDepth === 0 && char === "{";
    const blank = braceDepth > 0 || startsExpression;
    output += blank && char !== "\n" && char !== "\r" ? " " : char;

    if (startsExpression) {
      braceDepth = 1;
      continue;
    }

    if (braceDepth === 0) continue;

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") quote = char;
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
  }

  return output;
}

function isInsideRange(offset, ranges) {
  return ranges.some(([start, end]) => offset >= start && offset < end);
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
