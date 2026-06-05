import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const BUNDLED_SKILL = new URL("../../agent/skills/unship/SKILL.md", import.meta.url);
const BUNDLED_PICKER = new URL("../picker/unship-picker.js", import.meta.url);
const SKILL_PATHS = [
  ".agents/skills/unship/SKILL.md",
  ".claude/skills/unship/SKILL.md",
  ".opencode/skills/unship/SKILL.md"
];
const PICKER_CANDIDATES = ["public/unship-picker.js", "static/unship-picker.js", "src/assets/unship-picker.js"];
const SEARCH_EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".astro", ".vue", ".svelte"]);
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build", "coverage"]);
const DEFAULT_PREVIEW_PORTS = [3000, 3001, 5173, 5174, 4173, 4321, 4200, 8080];

export async function setupProject({ root = process.cwd(), dryRun = false } = {}) {
  const snippet = await inlineSnippet();
  const mount = {
    status: "manual",
    mode: "inline",
    snippet,
    instructions: [
      "Add the returned inline snippet to the smallest dev-only app shell or preview page that renders the Unship options.",
      "Keep the snippet local/dev-only and remove it before shipping."
    ]
  };

  return {
    ok: true,
    setup: "manual",
    framework: "universal",
    detectedFramework: "universal",
    signals: [],
    dryRun,
    picker: {
      status: "inline",
      path: "inline"
    },
    mount,
    next: mount.instructions
  };
}

export async function inspectProject({ root = process.cwd(), previewPorts } = {}) {
  const skillFile = await firstExisting(root, SKILL_PATHS);
  const pickerFile = await firstExisting(root, PICKER_CANDIDATES);
  const devMount = await findFirstMount(root);
  const previewServers = await detectPreviewServers({
    ports: previewPorts || DEFAULT_PREVIEW_PORTS
  });

  return {
    framework: "universal",
    signals: [],
    skillInstalled: Boolean(skillFile),
    skillFile,
    skillCurrent: skillFile ? await fileMatches(join(root, skillFile), BUNDLED_SKILL) : false,
    pickerFileFound: Boolean(pickerFile),
    pickerFile,
    pickerFileCurrent: pickerFile ? await fileMatches(join(root, pickerFile), BUNDLED_PICKER) : false,
    devMountFound: Boolean(devMount),
    devMountFile: devMount?.file || null,
    previewServers
  };
}

async function inlineSnippet() {
  const source = await readFile(BUNDLED_PICKER, "utf8");
  return `<script data-unship-dev>\n${source}\n</script>`;
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

async function findFirstMount(root) {
  for await (const file of walk(root)) {
    const rel = toPosix(relative(root, file));
    if (PICKER_CANDIDATES.includes(rel)) continue;
    const text = await readFile(file, "utf8");
    if (text.includes("data-unship-dev") || text.includes("unship-picker.js")) return { file: rel };
  }
  return null;
}

async function* walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      yield* walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SEARCH_EXTENSIONS.has(extension(entry.name))) yield full;
  }
}

function extension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}
