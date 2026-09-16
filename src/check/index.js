import { readFile } from "node:fs/promises";
import { projectInstructionPaths } from "../agent-targets/index.js";
import { walkProjectFiles } from "../project-files/index.js";

const EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".md", ".mdx", ".liquid", ".hbs", ".handlebars", ".njk", ".ejs"]);
// Retired attributes remain detectable so cleanup can remove older previews.
const PATTERNS = ["data-unship-dev", "data-unship-pick", "data-unship-option", "data-unship-tweaks", "data-unship-as", "data-unship-canvas", "unship-picker", "<!-- unship"];
const PICK_ATTR = "data-unship-pick";
const OPTION_ATTR = "data-unship-option";
const MAX_RANGE_LINES = 200;



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

export async function checkUnshipReadiness({ root = process.cwd(), includeBuild = false } = {}) {
  const groups = [];
  for await (const { file, rel } of walkProjectFiles({ root, extensions: EXTENSIONS, includeBuild, strict: true })) {
    if (isAllowedInstructionFile(rel)) continue;
    const text = await readFile(file, "utf8");
    groups.push(...scanReadiness(rel, sourceForScanning(rel, text)));
  }

  const findings = groups.flatMap((group) =>
    group.findings.map((finding) => ({ ...finding, file: group.file, group: group.pick }))
  );
  const count = (level) => findings.filter((finding) => finding.level === level).length;
  const failCount = count("fail");
  const uncertainCount = count("uncertain");
  const status = failCount ? "fail" : uncertainCount ? "uncertain" : "pass";

  return {
    ok: failCount === 0,
    status,
    groups,
    findings,
    summary: {
      groupCount: groups.length,
      failCount,
      uncertainCount,
      noteCount: count("note"),
      message: groups.length === 0
        ? "No Unship explorations found."
        : `Readiness ${status}: ${groups.length} ${plural("group", groups.length)}, ${failCount} ${plural("failure", failCount)}, ${uncertainCount} uncertain.`
    }
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
  const safe = blankJsxExpressions(text);
  const groups = [];
  const pickRegex = attributePresenceRegex(PICK_ATTR);
  let match;

  while ((match = pickRegex.exec(text))) {
    const element = elementForAttribute(text, match.index, lineStarts, safe);
    const range = findElementRange(text, lineStarts, element.startOffset, element.tag, safe);
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

const CANVAS_ATTR = "data-unship-canvas";

export function scanReadiness(file, rawText) {
  // Comments and script bodies are never live markup; blanking preserves
  // offsets and line numbers because only non-newline characters change.
  const text = blankScriptBodies(blankHtmlComments(rawText));
  const lineStarts = lineStartOffsets(text);
  const safe = blankJsxExpressions(text);
  const pickRegex = attributePresenceRegex(PICK_ATTR);
  const found = [];
  let match;
  while ((match = pickRegex.exec(text))) {
    if (!isLiveAttribute(text, safe, match.index)) continue;
    const element = elementForAttribute(text, match.index, lineStarts, safe);
    const range = findElementRange(text, lineStarts, element.startOffset, element.tag, safe);
    found.push({ attrOffset: match.index, element, range });
  }

  return found.map((group, index) => {
    const nestedRanges = found
      .filter((candidate) => candidate.element.startOffset > group.element.startOffset && candidate.range.endOffset <= group.range.endOffset)
      .map((candidate) => [candidate.element.startOffset, candidate.range.endOffset]);
    const pick = attributeValueAt(text, group.attrOffset, PICK_ATTR, index + 1)?.value || `Group ${index + 1}`;
    const startLine = lineIndexForOffset(lineStarts, group.element.startOffset) + 1;
    const findings = [];
    const retired = attributePresenceRegex("data-unship-tweaks");
    retired.lastIndex = group.element.startOffset;
    let retiredMatch;
    while ((retiredMatch = retired.exec(text)) && retiredMatch.index < group.range.endOffset) {
      if (isInsideRange(retiredMatch.index, nestedRanges) || !isLiveAttribute(text, safe, retiredMatch.index)) continue;
      findings.push({
        level: "fail",
        line: lineIndexForOffset(lineStarts, retiredMatch.index) + 1,
        code: "retired-attribute",
        message: "Remove retired data-unship-tweaks markup; make design adjustments directly in source."
      });
    }
    const options = collectOptionDetails(text, safe, lineStarts, group.element.startOffset, group.range.endOffset, nestedRanges);
    // Svelte/Angular template control flow governs visibility at runtime, so
    // any block marker inside the group range forces the uncertain tier.
    const rangeText = text.slice(group.element.startOffset, group.range.endOffset);
    const templated = /\{[#:/@][A-Za-z]/.test(rangeText) || rangeText.includes("*ngIf");
    const certain =
      !templated &&
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

    const groupTag = openTagAt(text, group.attrOffset, safe);
    const canvasHint = groupTag ? readQuotedAttribute(groupTag.source, CANVAS_ATTR) : null;
    if (canvasHint?.kind === "dynamic") {
      findings.push({
        level: "uncertain",
        line: startLine,
        code: "canvas-dynamic",
        message: "data-unship-canvas value is dynamic; verify the Canvas Arrangement manually."
      });
    } else if (canvasHint && !["stack", "grid"].includes(canvasHint.value)) {
      findings.push({
        level: "fail",
        line: startLine,
        code: "canvas-value",
        message: `data-unship-canvas must be "stack" or "grid", found "${canvasHint.value}".`
      });
    }

    return {
      file,
      pick,
      startLine,
      ...(group.range.endLine ? { endLine: group.range.endLine } : {}),
      options: options.map((option) => option.label),
      visibleCount: certain ? options.filter((option) => !option.hidden.present).length : null,
      findings
    };
  });
}

// Vue/Alpine/Angular directives that control rendering or visibility at
// runtime; their presence on an option tag makes static visibility unknowable.
const DYNAMIC_VISIBILITY = /(?<=[\s<])(?:v-if|v-else-if|v-else|v-show|x-if|x-show)(?=[\s>/=]|$)/;

function collectOptionDetails(text, safe, lineStarts, startOffset, endOffset, nestedRanges) {
  const details = [];
  let bareCount = 0;
  const optionRegex = attributePresenceRegex(OPTION_ATTR);
  optionRegex.lastIndex = startOffset;

  let match;
  while ((match = optionRegex.exec(text)) && match.index < endOffset) {
    if (isInsideRange(match.index, nestedRanges)) continue;
    if (!isLiveAttribute(text, safe, match.index)) continue;

    const value = attributeValueAt(text, match.index, OPTION_ATTR, bareCount + 1);
    if (!value) continue;
    if (value.bare) bareCount += 1;
    const tag = openTagAt(text, match.index, safe);
    const depth = depthAtOffset(text, startOffset, match.index, safe);
    const directiveControlled = tag ? DYNAMIC_VISIBILITY.test(tag.source) || tag.source.includes("*ngIf") : false;
    details.push({
      label: value.value,
      line: lineIndexForOffset(lineStarts, match.index) + 1,
      certain: value.kind === "literal" && depth === 1 && Boolean(tag),
      hidden: tag && !directiveControlled ? readBooleanAttribute(tag.source, "hidden") : { kind: "dynamic", present: false }
    });
  }
  return details;
}

// A match is a live attribute only when it sits inside an open tag's
// attribute region, outside any quoted value, and is not the suffix of a
// longer attribute name.
function isLiveAttribute(text, safe, attrOffset) {
  const before = text[attrOffset - 1];
  if (before !== undefined && !/[\s<]/.test(before)) return false;
  const tag = openTagAt(text, attrOffset, safe);
  if (!tag) return false;
  let quote = null;
  for (let index = tag.start; index < attrOffset; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    }
  }
  return quote === null;
}

function blankHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n\r]/g, " "));
}

function blankScriptBodies(text) {
  return text.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (whole, open, body, close) => `${open}${body.replace(/[^\n\r]/g, " ")}${close}`
  );
}

// The open tag containing the attribute at attrOffset, or null when the tag
// boundary cannot be located. Quoted attribute values protect ">", "{", and
// "<" from ending the scan, so quoted attribute values survive intact.
// Open tags larger than this are assumed corrupt (e.g. a degraded blanker on
// adversarial input); bounding the scans keeps the pass linear and degrades
// such elements to the uncertain tier instead of hanging.
const MAX_TAG_SCAN = 16384;

function openTagAt(text, attrOffset, precomputedSafe) {
  const safe = precomputedSafe ?? blankJsxExpressions(text);
  const stop = Math.max(0, attrOffset - MAX_TAG_SCAN);
  let start = -1;
  for (let index = attrOffset; index >= stop; index -= 1) {
    const char = safe[index];
    if (char === ">") return null;
    if (char === "<") {
      start = index;
      break;
    }
  }
  if (start === -1) return null;
  const end = tagEndOffset(text, start);
  if (end === -1) return null;
  return { start, end: end + 1, source: text.slice(start, end + 1) };
}

function tagEndOffset(text, start) {
  let quote = null;
  let braceDepth = 0;
  let escaped = false;
  const scanEnd = Math.min(text.length, start + MAX_TAG_SCAN);
  for (let index = start; index < scanEnd; index += 1) {
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

function elementForAttribute(text, attrOffset, lineStarts, safe) {
  const safeText = safe ?? blankJsxExpressions(text);
  const tagStart = safeText.lastIndexOf("<", attrOffset);
  const tagEnd = safeText.lastIndexOf(">", attrOffset);
  if (tagStart !== -1 && tagStart > tagEnd) {
    const match = safeText.slice(tagStart, attrOffset).match(/^<([A-Za-z][\w:.-]*)\b/);
    if (match) return { tag: match[1], startOffset: tagStart };
  }

  const lineIndex = lineIndexForOffset(lineStarts, attrOffset);
  return { tag: null, startOffset: lineStarts[lineIndex] };
}

function findElementRange(text, lineStarts, startOffset, tag, safe) {
  const startLineIndex = lineIndexForOffset(lineStarts, startOffset);
  const fallbackLineIndex = Math.min(lineStarts.length - 1, startLineIndex + MAX_RANGE_LINES);
  const fallbackEndOffset = fallbackLineIndex + 1 < lineStarts.length ? lineStarts[fallbackLineIndex + 1] : text.length;
  if (!tag) return { endLine: null, endOffset: fallbackEndOffset, confidence: "low" };

  let depth = 0;
  let opened = false;
  const escaped = escapeRegExp(tag);
  const token = new RegExp(`</?${escaped}\\b[^>]*>`, "gs");
  const source = (safe ?? blankJsxExpressions(text)).slice(startOffset, fallbackEndOffset);

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

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function depthAtOffset(text, startOffset, offset, safe) {
  let depth = 0;
  const token = /<\/?([A-Za-z][\w:.-]*)\b[^>]*>/gs;
  const source = safe ? safe.slice(startOffset, offset) : blankJsxExpressions(text.slice(startOffset, offset));
  for (const match of source.matchAll(token)) {
    const value = match[0];
    if (VOID_TAGS.has(match[1].toLowerCase())) continue;
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
  return rel === "agent/skills/unship/SKILL.md" || projectInstructionPaths.has(rel);
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
