import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { backupFile, walkProjectFiles } from "../project-files/index.js";
import { projectInstructionPaths } from "../agent-targets/index.js";

const BUNDLED_SKILL = new URL("../../agent/skills/unship/SKILL.md", import.meta.url);
const BUNDLED_PICKER = new URL("../picker/unship-picker.js", import.meta.url);
export const PICKER_CANDIDATES = ["public/unship-picker.js", "static/unship-picker.js", "src/assets/unship-picker.js"];
const SEARCH_EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".astro", ".vue", ".svelte"]);

export async function pickerSnippet({ inline = false, src = "/unship-picker.js", persist, globalShortcuts = false } = {}) {
  if (persist !== undefined && persist !== "local") throw new Error("--persist must be local.");
  const attrs = ["data-unship-dev"];
  if (persist === "local") attrs.push('data-unship-persist="local"');
  if (globalShortcuts) attrs.push("data-unship-global-shortcuts");
  if (inline) return `<script ${attrs.join(" ")}>\n${await readFile(BUNDLED_PICKER, "utf8")}\n</script>`;
  const escaped = src.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<script src="${escaped}" ${attrs.join(" ")}></script>`;
}

export async function setupProject({ root = process.cwd(), out, src, inline = false, force = false, dryRun = false, persist, globalShortcuts } = {}) {
  if (src && !out) throw new Error("setup --src requires --out; use --inline for an embedded snippet.");
  if (out && inline) throw new Error("Use --out for a runtime file or --inline for an embedded snippet, not both.");
  const snippet = out && !src ? null : await pickerSnippet({ inline: !out, src, persist, globalShortcuts });
  const mount = {
    status: "manual",
    mode: out ? "external" : "inline",
    snippet,
    instructions: [out
      ? "Use one dev-only app shell mount; its URL must serve the picker file. Remove it before shipping."
      : "Add this snippet to one dev-only app shell or preview page. Remove it before shipping."]
  };
  if (!out) return {
    ok: true, setup: "manual", framework: "universal", detectedFramework: "universal", signals: [], dryRun,
    picker: { status: "inline", path: "inline" }, mount, next: mount.instructions
  };

  const path = resolve(root, out);
  const source = await readFile(BUNDLED_PICKER, "utf8");
  let existing = null;
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error(`Picker destination must be a regular file: ${path}`);
    existing = await readFile(path, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const current = existing === source;
  const blocked = existing !== null && !current && !force;
  const status = current ? "current" : blocked ? "different" : existing === null ? "created" : "updated";
  let backup;
  if (!current && !blocked && !dryRun) {
    await mkdir(dirname(path), { recursive: true });
    if (existing !== null) backup = await backupFile(path, join(root, ".unship", "backups"));
    await writeFile(path, source, { encoding: "utf8", flag: existing === null ? "wx" : "w" });
  }
  return {
    ok: !blocked, dryRun,
    picker: { status: dryRun && !current && !blocked ? `would-${status === "created" ? "create" : "update"}` : status, path, current: current || (!blocked && !dryRun), ...(backup ? { backup } : {}) },
    mount,
    next: blocked
      ? ["The destination differs from this build. Inspect it, then repeat setup with --force to replace it with a backup."]
      : mount.instructions
  };
}

export async function inspectProject({ root = process.cwd(), out, inline = false, previewPorts = [] } = {}) {
  if (inline && !out) throw new Error("Use doctor --inline --out <HTML-file> to inspect an inline mount.");
  const skillFile = await firstExisting(root, [...projectInstructionPaths].filter((path) => path.endsWith("/SKILL.md")));
  const pickerFile = out ? (await existsPath(resolve(root, out)) ? out : null) : await firstExisting(root, PICKER_CANDIDATES);
  const inlineText = inline && pickerFile ? await readFile(resolve(root, pickerFile), "utf8") : null;
  const devMount = inline
    ? (inlineText?.includes("data-unship-dev") ? { file: pickerFile, text: inlineText } : null)
    : await findFirstMount(root, out && resolve(root, out));
  const embedded = devMount?.text.match(/<script\b(?=[^>]*\bdata-unship-dev\b)[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  const pickerFileCurrent = !inline && pickerFile ? await fileMatches(resolve(root, pickerFile), BUNDLED_PICKER) : false;
  const inspectInline = inline || (!out && !pickerFile && Boolean(embedded));
  const pickerCurrent = inspectInline
    ? (embedded ? embedded.trim() === (await readFile(BUNDLED_PICKER, "utf8")).trim() : null)
    : pickerFile ? pickerFileCurrent : null;
  return {
    framework: "universal", signals: [],
    skillInstalled: Boolean(skillFile), skillFile,
    skillCurrent: skillFile ? await fileMatches(join(root, skillFile), BUNDLED_SKILL) : false,
    pickerFileFound: Boolean(pickerFile) && !inline, pickerFile: inline ? null : pickerFile, pickerFileCurrent,
    pickerCurrent, pickerMode: inspectInline ? "inline" : "external",
    devMountFound: Boolean(devMount), devMountFile: devMount?.file || null,
    previewServers: await detectPreviewServers({ ports: previewPorts })
  };
}

async function detectPreviewServers({ ports }) {
  const uniquePorts = [...new Set(ports.map(Number).filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];
  const results = await Promise.all(uniquePorts.map((port) => probePreviewPort(port)));
  return results.filter(Boolean);
}

async function probePreviewPort(port) {
  const url = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual"
    });
    const contentType = response.headers.get("content-type") || "";
    const text = contentType.includes("text/html") ? await response.text() : "";
    return {
      url,
      port,
      status: response.status,
      title: titleFromHtml(text)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function titleFromHtml(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : "";
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

async function firstExisting(root, paths) {
  for (const path of paths) {
    if (await exists(root, path)) return path;
  }
  return null;
}

async function exists(root, path) {
  return existsPath(join(root, path));
}

async function existsPath(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fileMatches(path, referenceUrl) {
  try {
    const [left, right] = await Promise.all([
      readFile(path, "utf8"),
      readFile(referenceUrl, "utf8")
    ]);
    return left === right;
  } catch {
    return false;
  }
}

async function findFirstMount(root, out) {
  for await (const { file, rel } of walkProjectFiles({ root, extensions: SEARCH_EXTENSIONS })) {
    if (PICKER_CANDIDATES.includes(rel) || file === out) continue;
    const text = await readFile(file, "utf8");
    if (text.includes("data-unship-dev") || text.includes("unship-picker.js")) return { file: rel, text };
  }
  return null;
}
