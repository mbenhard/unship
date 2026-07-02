import { readFile } from "node:fs/promises";
import { walkProjectFiles } from "../project-files/index.js";

const EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".md", ".mdx", ".liquid", ".hbs", ".handlebars", ".njk", ".ejs"]);
const PATTERNS = ["data-unship-pick", "data-unship-option", "data-unship-tweaks", "data-unship-as", "unship-picker", "<!-- unship"];
const PICK_ATTR = "data-unship-pick";
const OPTION_ATTR = "data-unship-option";
const MAX_RANGE_LINES = 200;

const ALLOWED_PATHS = [
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
  for await (const { file, rel } of walkProjectFiles({ root, extensions: EXTENSIONS, includeBuild, strict: true })) {
    if (isAllowedInstructionFile(rel)) continue;
    const text = await readFile(file, "utf8");
    const scanSource = sourceForScanning(rel, text);
    diagnostics.push(...scanText(rel, scanSource));
    explorations.push(...scanExplorations(rel, scanSource));
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
      let column = lineText.indexOf(pattern);
      while (column !== -1) {
        diagnostics.push({
          file,
          line: index + 1,
          column: column + 1,
          pattern,
          message: "Remove temporary Unship picker markup before shipping."
        });
        column = lineText.indexOf(pattern, column + pattern.length);
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

const TWEAKS_ATTR = "data-unship-tweaks";
const AS_ATTR = "data-unship-as";

export function scanReadiness(file, text) {
  const lineStarts = lineStartOffsets(text);
  const pickRegex = attributePresenceRegex(PICK_ATTR);
  const found = [];
  let match;
  while ((match = pickRegex.exec(text))) {
    const element = elementForAttribute(text, match.index, lineStarts);
    const range = findElementRange(text, lineStarts, element.startOffset, element.tag);
    found.push({ attrOffset: match.index, element, range });
  }

  return found.map((group, index) => {
    const nestedRanges = found
      .filter((candidate) => candidate.element.startOffset > group.element.startOffset && candidate.range.endOffset <= group.range.endOffset)
      .map((candidate) => [candidate.element.startOffset, candidate.range.endOffset]);
    const pick = attributeValueAt(text, group.attrOffset, PICK_ATTR, index + 1)?.value || `Group ${index + 1}`;
    const startLine = lineIndexForOffset(lineStarts, group.element.startOffset) + 1;
    const findings = [];
    const options = collectOptionDetails(text, lineStarts, group.element.startOffset, group.range.endOffset, nestedRanges);
    const certain =
      group.range.confidence === "high" &&
      options.length > 0 &&
      options.every((option) => option.certain && option.hidden.kind !== "dynamic");

    if (!options.length) {
      findings.push({
        level: group.range.confidence === "high" ? "fail" : "uncertain",
        line: startLine,
        code: "no-options",
        message: "No data-unship-option children found for this group."
      });
    } else if (certain) {
      const visible = options.filter((option) => !option.hidden.present);
      if (visible.length !== 1) {
        findings.push({
          level: "fail",
          line: startLine,
          code: "visible-count",
          message: `Expected exactly one visible option, found ${visible.length}.`
        });
      }
      const seen = new Set();
      for (const option of options) {
        if (seen.has(option.label)) {
          findings.push({
            level: "fail",
            line: option.line,
            code: "duplicate-label",
            message: `Option label "${option.label}" appears more than once in this group.`
          });
        }
        seen.add(option.label);
      }
    } else {
      findings.push({
        level: "uncertain",
        line: startLine,
        code: "structure-uncertain",
        message: "Group structure could not be statically verified (templated or dynamic markup). Verify readiness manually."
      });
    }

    const groupTag = openTagAt(text, group.attrOffset);
    const groupAxes = readAxes({
      tweaks: groupTag ? readQuotedAttribute(groupTag.source, TWEAKS_ATTR) : null,
      style: groupTag ? readQuotedAttribute(groupTag.source, "style") : null,
      line: startLine,
      findings
    });

    const optionAxes = options.map((option) => {
      const axes = readAxes({ tweaks: option.tweaks, style: option.style, line: option.line, findings });
      const vars = new Set(groupAxes.map((axis) => axis.var));
      for (const axis of axes) {
        if (vars.has(axis.var)) {
          findings.push({
            level: "fail",
            line: option.line,
            code: "duplicate-var",
            message: `Axis var "${axis.var}" is declared more than once in the panel for option "${option.label}".`
          });
        }
        vars.add(axis.var);
      }
      return axes;
    });

    const asHint = groupTag ? readQuotedAttribute(groupTag.source, AS_ATTR) : null;
    if (asHint?.kind === "dynamic") {
      findings.push({
        level: "uncertain",
        line: startLine,
        code: "as-dynamic",
        message: "data-unship-as value is dynamic; verify the inline-group hint manually."
      });
    } else if (asHint && asHint.value !== "segmented" && asHint.value !== "toggle") {
      findings.push({
        level: "fail",
        line: startLine,
        code: "as-value",
        message: `data-unship-as must be "segmented" or "toggle", found "${asHint.value}".`
      });
    } else if (asHint && certain && options.length > 4) {
      findings.push({
        level: "note",
        line: startLine,
        code: "as-overflow",
        message: "data-unship-as is ignored for groups with more than 4 options; this group renders as a full dock group."
      });
    }

    return {
      file,
      pick,
      startLine,
      options: options.map((option) => option.label),
      visibleCount: certain ? options.filter((option) => !option.hidden.present).length : null,
      axes: [
        ...groupAxes.map((axis) => ({ ...axis, on: "group" })),
        ...optionAxes.flatMap((axes, optionIndex) => axes.map((axis) => ({ ...axis, on: options[optionIndex].label })))
      ],
      findings
    };
  });
}

function collectOptionDetails(text, lineStarts, startOffset, endOffset, nestedRanges) {
  const details = [];
  let bareCount = 0;
  const optionRegex = attributePresenceRegex(OPTION_ATTR);
  optionRegex.lastIndex = startOffset;

  let match;
  while ((match = optionRegex.exec(text)) && match.index < endOffset) {
    if (isInsideRange(match.index, nestedRanges)) continue;

    const value = attributeValueAt(text, match.index, OPTION_ATTR, bareCount + 1);
    if (!value) continue;
    if (value.bare) bareCount += 1;
    const tag = openTagAt(text, match.index);
    const depth = depthAtOffset(text, startOffset, match.index);
    details.push({
      label: value.value,
      line: lineIndexForOffset(lineStarts, match.index) + 1,
      certain: value.kind === "literal" && depth === 1 && Boolean(tag),
      hidden: tag ? readBooleanAttribute(tag.source, "hidden") : { kind: "dynamic", present: false },
      tweaks: tag ? readQuotedAttribute(tag.source, TWEAKS_ATTR) : null,
      style: tag ? readQuotedAttribute(tag.source, "style") : null
    });
  }
  return details;
}

// The open tag containing the attribute at attrOffset, or null when the tag
// boundary cannot be located. Quoted attribute values protect ">", "{", and
// "<" from ending the scan, so JSON tweak payloads survive intact.
function openTagAt(text, attrOffset) {
  const safe = blankJsxExpressions(text);
  const start = safe.lastIndexOf("<", attrOffset);
  const closeBefore = safe.lastIndexOf(">", attrOffset);
  if (start === -1 || closeBefore > start) return null;
  const end = tagEndOffset(text, start);
  if (end === -1) return null;
  return { start, end: end + 1, source: text.slice(start, end + 1) };
}

function tagEndOffset(text, start) {
  let quote = null;
  let braceDepth = 0;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\" && braceDepth > 0) escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'" || (braceDepth > 0 && char === "`")) quote = char;
    else if (char === "{") braceDepth += 1;
    else if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (char === ">" && braceDepth === 0) return index;
    else if (char === "<" && braceDepth === 0 && index > start) return -1;
  }
  return -1;
}

// Literal quoted attribute values only; JSX-brace values report "dynamic".
// Unlike attributeValueAt, the quoted form runs to the matching quote, so
// JSON payloads full of braces survive intact.
function readQuotedAttribute(tagSource, attr) {
  const escaped = escapeRegExp(attr);
  const literal = new RegExp(`(?<=[\\s<])${escaped}\\s*=\\s*("([^"]*)"|'([^']*)')`, "s").exec(tagSource);
  if (literal) return { kind: "literal", value: literal[2] ?? literal[3] };
  if (new RegExp(`(?<=[\\s<])${escaped}\\s*=\\s*\\{`).test(tagSource)) return { kind: "dynamic", value: null };
  if (new RegExp(`(?<=[\\s<])${escaped}(?=[\\s>/]|$)`).test(tagSource)) return { kind: "literal", value: "" };
  return null;
}

function readBooleanAttribute(tagSource, attr) {
  const escaped = escapeRegExp(attr);
  if (new RegExp(`(?<=[\\s<])${escaped}\\s*=\\s*\\{`).test(tagSource)) return { kind: "dynamic", present: false };
  if (new RegExp(`(?<=[\\s<])${escaped}(?=[\\s>/=]|$)`).test(tagSource)) return { kind: "literal", present: true };
  return { kind: "literal", present: false };
}

const KNOWN_AXIS_TYPES = new Set(["slider", "segmented", "toggle", "swatch"]);

function readAxes({ tweaks, style, line, findings }) {
  if (!tweaks) return [];
  if (tweaks.kind !== "literal") {
    findings.push({
      level: "uncertain",
      line,
      code: "tweaks-dynamic",
      message: "data-unship-tweaks value is dynamic; verify axes manually."
    });
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(tweaks.value);
  } catch {
    findings.push({ level: "fail", line, code: "tweaks-json", message: "data-unship-tweaks is not valid JSON." });
    return [];
  }
  if (!Array.isArray(parsed)) {
    findings.push({ level: "fail", line, code: "tweaks-json", message: "data-unship-tweaks must be a JSON array of axes." });
    return [];
  }

  const axes = [];
  parsed.forEach((axis, index) => {
    const label = typeof axis?.label === "string" && axis.label.trim() ? axis.label : `axis ${index + 1}`;
    if (!axis || typeof axis !== "object" || !KNOWN_AXIS_TYPES.has(axis.type)) {
      findings.push({
        level: "fail",
        line,
        code: "axis-type",
        message: `${label}: unknown control type "${axis?.type}". Known types: slider, segmented, toggle, swatch.`
      });
      return;
    }
    if (typeof axis.var !== "string" || !axis.var.startsWith("--")) {
      findings.push({ level: "fail", line, code: "axis-var", message: `${label}: every axis must name a CSS custom property in "var".` });
      return;
    }
    if (!validAxisShape(axis)) {
      findings.push({ level: "fail", line, code: "axis-shape", message: `${label}: invalid fields for control type "${axis.type}".` });
      return;
    }
    if (style?.kind === "dynamic") {
      findings.push({
        level: "uncertain",
        line,
        code: "axis-default",
        message: `${label}: could not statically confirm an inline default for ${axis.var}.`
      });
    } else if (!style || !style.value.includes(`${axis.var}:`)) {
      findings.push({
        level: "fail",
        line,
        code: "axis-default",
        message: `${label}: declare an inline default for ${axis.var} in the element's style attribute.`
      });
    }
    axes.push({ label, var: axis.var, type: axis.type });
  });
  return axes;
}

function validAxisShape(axis) {
  if (axis.type === "slider") {
    const stepped = Array.isArray(axis.steps) && axis.steps.length >= 2 && axis.steps.every(isLabeledValue);
    const numeric = Number.isFinite(axis.min) && Number.isFinite(axis.max) && axis.max > axis.min;
    return (stepped || numeric) && !(stepped && numeric);
  }
  if (axis.type === "segmented") {
    return Array.isArray(axis.options) && axis.options.length >= 2 && axis.options.length <= 4 && axis.options.every(isLabeledValue);
  }
  if (axis.type === "swatch") {
    return Array.isArray(axis.options) && axis.options.length >= 2 && axis.options.every(isLabeledValue);
  }
  return typeof axis.on === "string" && typeof axis.off === "string";
}

function isLabeledValue(entry) {
  return Boolean(entry) && typeof entry.label === "string" && typeof entry.value === "string";
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

function isAllowedInstructionFile(rel) {
  return ALLOWED_PATHS.some((pattern) => pattern.test(rel));
}

function sourceForScanning(file, text) {
  if (file.endsWith(".md") || file.endsWith(".mdx")) return blankMarkdownFences(text);
  return text;
}

function blankMarkdownFences(text) {
  let fence = null;
  return text.split(/(?<=\n)/).map((line) => {
    const newlineMatch = line.match(/(\r?\n)$/);
    const newline = newlineMatch ? newlineMatch[0] : "";
    const body = newline ? line.slice(0, -newline.length) : line;
    const candidate = markdownFence(body);
    let blank = false;
    if (fence) {
      blank = true;
      if (
        candidate &&
        candidate.marker === fence.marker &&
        candidate.length >= fence.length &&
        candidate.closing
      ) {
        fence = null;
      }
    } else if (candidate) {
      blank = true;
      fence = candidate;
    }
    return blank ? `${body.replace(/[^\t]/g, " ")}${newline}` : line;
  }).join("");
}

function markdownFence(line) {
  const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return null;
  return {
    marker: match[1][0],
    length: match[1].length,
    closing: /^\s*$/.test(match[2])
  };
}
