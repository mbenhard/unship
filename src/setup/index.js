import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

const FRAMEWORKS = new Set(["auto", "next", "vite", "astro", "sveltekit", "nuxt", "angular", "universal"]);
const SKILL_PATHS = [
  ".agents/skills/unship/SKILL.md",
  ".claude/skills/unship/SKILL.md",
  ".opencode/skills/unship/SKILL.md"
];
const PICKER_CANDIDATES = ["public/unship-picker.js", "static/unship-picker.js", "src/assets/unship-picker.js"];
const SEARCH_EXTENSIONS = new Set([".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".astro", ".vue", ".svelte"]);
const IGNORE_DIRS = new Set([".git", "node_modules", ".next", ".nuxt", ".svelte-kit", "dist", "build", "coverage"]);
const DEFAULT_PREVIEW_PORTS = {
  next: [3000, 3001],
  vite: [5173, 5174, 4173],
  astro: [4321],
  sveltekit: [5173],
  nuxt: [3000, 3001],
  angular: [4200],
  universal: [3000, 3001, 5173, 4321, 4200, 8080]
};

export async function setupProject({ root = process.cwd(), framework = "auto", force = false, dryRun = false } = {}) {
  const requested = normalizeFramework(framework);
  const detected = await detectProject(root);
  const resolved = requested === "auto" ? detected.framework : requested;
  const pickerPath = pickerPathFor(resolved);
  const picker = await installPicker({ root, path: pickerPath, force, dryRun });
  const mount = await mountPicker({ root, framework: resolved, force, dryRun });

  return {
    ok: true,
    framework: resolved,
    detectedFramework: detected.framework,
    signals: detected.signals,
    picker,
    mount,
    next: mount.status === "manual" ? mount.instructions : []
  };
}

export async function inspectProject({ root = process.cwd(), previewPorts } = {}) {
  const detected = await detectProject(root);
  const skillInstalled = await existsAny(root, SKILL_PATHS);
  const pickerFile = await firstExisting(root, PICKER_CANDIDATES);
  const devMount = await findFirstText(root, "unship-picker");
  const previewServers = await detectPreviewServers({
    ports: previewPorts || previewPortsFor(detected.framework)
  });

  return {
    framework: detected.framework,
    signals: detected.signals,
    skillInstalled,
    pickerFileFound: Boolean(pickerFile),
    pickerFile,
    devMountFound: Boolean(devMount),
    devMountFile: devMount?.file || null,
    previewServers
  };
}

export async function detectProject(root = process.cwd()) {
  const pkg = await readPackage(root);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const signals = [];

  for (const key of Object.keys(deps)) signals.push(`package:${key}`);

  if (deps.next || await exists(root, "next.config.js") || await exists(root, "next.config.mjs")) {
    return { framework: "next", signals };
  }
  if (deps.nuxt || await exists(root, "nuxt.config.ts") || await exists(root, "nuxt.config.js")) {
    return { framework: "nuxt", signals };
  }
  if (deps["@sveltejs/kit"] || await exists(root, "svelte.config.js")) {
    return { framework: "sveltekit", signals };
  }
  if (deps.astro || await exists(root, "astro.config.mjs") || await exists(root, "astro.config.ts")) {
    return { framework: "astro", signals };
  }
  if (deps["@angular/core"] || deps["@angular/cli"] || await exists(root, "angular.json")) {
    return { framework: "angular", signals };
  }
  if (deps.vite || await exists(root, "vite.config.ts") || await exists(root, "vite.config.js") || await exists(root, "index.html")) {
    return { framework: "vite", signals };
  }

  return { framework: "universal", signals };
}

function normalizeFramework(framework) {
  const value = String(framework || "auto").toLowerCase();
  if (!FRAMEWORKS.has(value)) throw new Error(`Unknown setup framework: ${framework}`);
  return value;
}

function pickerPathFor(framework) {
  if (framework === "sveltekit") return "static/unship-picker.js";
  if (framework === "angular") return "src/assets/unship-picker.js";
  return "public/unship-picker.js";
}

function previewPortsFor(framework) {
  return DEFAULT_PREVIEW_PORTS[framework] || DEFAULT_PREVIEW_PORTS.universal;
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

async function installPicker({ root, path, force, dryRun }) {
  const destination = join(root, path);
  if (await existsPath(destination)) {
    if (!force) return { path, status: "existing" };
  }
  if (dryRun) return { path, status: force ? "would-overwrite" : "would-copy" };
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(new URL("../picker/unship-picker.js", import.meta.url), destination);
  return { path, status: force ? "overwritten" : "copied" };
}

async function mountPicker({ root, framework, force, dryRun }) {
  if (framework === "next") return patchNext(root, { force, dryRun });
  if (framework === "vite") return patchVite(root, { force, dryRun });
  if (framework === "astro") return patchAstro(root, { force, dryRun });
  if (framework === "sveltekit") return patchSvelteKit(root, { force, dryRun });
  if (framework === "nuxt") return patchNuxt(root, { force, dryRun });
  if (framework === "angular") {
    return {
      status: "manual",
      framework,
      instructions: [
        "Mount src/assets/unship-picker.js from a localhost-only dev path in src/index.html or the app shell.",
        "Remove that mount and the picker file before shipping."
      ]
    };
  }
  return {
    status: "manual",
    framework,
    instructions: [
      "Serve public/unship-picker.js from your app and add the snippet from npx unship snippet to a local-only preview shell.",
      "Remove the snippet and picker file before shipping."
    ]
  };
}

async function patchNext(root, { dryRun }) {
  const file = await firstExisting(root, [
    "app/layout.tsx",
    "app/layout.jsx",
    "app/layout.ts",
    "app/layout.js",
    "src/app/layout.tsx",
    "src/app/layout.jsx",
    "src/app/layout.ts",
    "src/app/layout.js"
  ]);
  if (!file) {
    return {
      status: "manual",
      framework: "next",
      instructions: ["Add the dev-only Script snippet from npx unship snippet to your root app layout body."]
    };
  }

  const absolute = join(root, file);
  const original = await readFile(absolute, "utf8");
  if (original.includes("unship-picker.js")) return { status: "existing", framework: "next", file };

  const snippet = `{process.env.NODE_ENV === "development" ? (
        <Script src="/unship-picker.js" data-unship-dev strategy="afterInteractive" />
      ) : null}`;
  let next = addImport(original, 'import Script from "next/script";');
  next = next.replace("</body>", `${snippet}\n      </body>`);
  if (next === original) {
    return {
      status: "manual",
      framework: "next",
      file,
      instructions: ["Add the dev-only Script snippet from npx unship snippet inside the root layout body."]
    };
  }
  if (!dryRun) await writeFile(absolute, next, "utf8");
  return { status: dryRun ? "would-patch" : "patched", framework: "next", file };
}

async function patchVite(root, { dryRun }) {
  const file = await firstExisting(root, ["index.html"]);
  if (!file) {
    return {
      status: "manual",
      framework: "vite",
      instructions: ["Add a dev-only module script that imports /unship-picker.js to index.html."]
    };
  }
  const absolute = join(root, file);
  const original = await readFile(absolute, "utf8");
  if (original.includes("unship-picker.js")) return { status: "existing", framework: "vite", file };

  const snippet = `  <script type="module">
    if (import.meta.env.DEV) import("/unship-picker.js");
  </script>
`;
  const next = original.replace("</body>", `${snippet}</body>`);
  if (next === original) {
    return { status: "manual", framework: "vite", file, instructions: ["Insert the dev-only import snippet before </body>."] };
  }
  if (!dryRun) await writeFile(absolute, next, "utf8");
  return { status: dryRun ? "would-patch" : "patched", framework: "vite", file };
}

async function patchAstro(root, { dryRun }) {
  const file = await firstExisting(root, ["src/layouts/Layout.astro", "src/layouts/Base.astro", "src/pages/index.astro"]);
  if (!file) {
    return {
      status: "manual",
      framework: "astro",
      instructions: ["Add an import.meta.env.DEV-gated /unship-picker.js script to the active Astro layout."]
    };
  }
  const absolute = join(root, file);
  const original = await readFile(absolute, "utf8");
  if (original.includes("unship-picker.js")) return { status: "existing", framework: "astro", file };

  const snippet = `{import.meta.env.DEV ? <script src="/unship-picker.js" data-unship-dev></script> : null}
`;
  const next = original.replace("</body>", `${snippet}</body>`);
  if (next === original) {
    return { status: "manual", framework: "astro", file, instructions: ["Insert the dev-only script before </body>."] };
  }
  if (!dryRun) await writeFile(absolute, next, "utf8");
  return { status: dryRun ? "would-patch" : "patched", framework: "astro", file };
}

async function patchSvelteKit(root, { dryRun }) {
  const file = "src/hooks.client.ts";
  const absolute = join(root, file);
  if (await existsPath(absolute)) {
    const text = await readFile(absolute, "utf8");
    if (text.includes("unship-picker.js")) return { status: "existing", framework: "sveltekit", file };
    return {
      status: "manual",
      framework: "sveltekit",
      file,
      instructions: ["A src/hooks.client.ts file already exists; add the Unship dev script mount there deliberately."]
    };
  }

  const content = `if (import.meta.env.DEV && typeof document !== "undefined") {
  const mountUnship = () => {
    if (document.querySelector('script[src="/unship-picker.js"]')) return;
    const script = document.createElement("script");
    script.src = "/unship-picker.js";
    script.setAttribute("data-unship-dev", "");
    document.body.appendChild(script);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountUnship, { once: true });
  else mountUnship();
}
`;
  if (!dryRun) {
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return { status: dryRun ? "would-create" : "created", framework: "sveltekit", file };
}

async function patchNuxt(root, { dryRun }) {
  const file = "plugins/unship.client.ts";
  const absolute = join(root, file);
  if (await existsPath(absolute)) {
    const text = await readFile(absolute, "utf8");
    if (text.includes("unship-picker.js")) return { status: "existing", framework: "nuxt", file };
    return {
      status: "manual",
      framework: "nuxt",
      file,
      instructions: ["plugins/unship.client.ts already exists; add the Unship dev script mount there deliberately."]
    };
  }

  const content = `export default defineNuxtPlugin(() => {
  if (!import.meta.dev) return;
  if (document.querySelector('script[src="/unship-picker.js"]')) return;
  const script = document.createElement("script");
  script.src = "/unship-picker.js";
  script.setAttribute("data-unship-dev", "");
  document.body.appendChild(script);
});
`;
  if (!dryRun) {
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return { status: dryRun ? "would-create" : "created", framework: "nuxt", file };
}

function addImport(text, statement) {
  if (text.includes(statement)) return text;
  const lines = text.split("\n");
  let lastImport = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^import\s/.test(lines[index])) lastImport = index;
  }
  if (lastImport === -1) return `${statement}\n${text}`;
  lines.splice(lastImport + 1, 0, statement);
  return lines.join("\n");
}

async function readPackage(root) {
  try {
    return JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

async function existsAny(root, paths) {
  for (const path of paths) {
    if (await exists(root, path)) return true;
  }
  return false;
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

async function findFirstText(root, needle) {
  for await (const file of walk(root)) {
    const text = await readFile(file, "utf8");
    if (text.includes(needle)) return { file: toPosix(relative(root, file)) };
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
      if (!IGNORE_DIRS.has(entry.name)) yield* walk(full);
      continue;
    }
    if (entry.isFile() && SEARCH_EXTENSIONS.has(extension(entry.name))) yield full;
  }
}

function extension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

function toPosix(path) {
  return path.split(sep).join("/");
}
