import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

const CLI = new URL("../src/cli/index.js", import.meta.url).pathname;

async function writeFixture(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    return await callback(port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function runCli(args, cwd) {
  const child = spawn(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise((resolve) => child.on("close", resolve));
  return { status, stdout, stderr };
}

test("init writes portable skill by default", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.written.includes(".agents/skills/unship/SKILL.md"), true);
  const skill = await readFile(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "utf8");
  assert.match(skill, /name: unship/);
  assert.match(skill, /Brand read/);
  assert.match(skill, /Fast Start/);
  assert.match(skill, /use unship to generate 4 variants/i);
  assert.doesNotMatch(skill, /unship-design/);
});

test("init all writes claude and opencode shims", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  const result = spawnSync(process.execPath, [CLI, "init", "--target", "all", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.match(await readFile(join(cwd, ".claude", "skills", "unship", "SKILL.md"), "utf8"), /name: unship/);
  assert.match(await readFile(join(cwd, ".opencode", "commands", "unship.md"), "utf8"), /Use the Unship skill/);
});

test("init does not overwrite without force", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const second = spawnSync(process.execPath, [CLI, "init", "--json"], { cwd, encoding: "utf8" });
  const json = JSON.parse(second.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.skipped.includes(".agents/skills/unship/SKILL.md"), true);
});

test("snippet prints local picker script", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<script src="\/unship-picker\.js" data-unship-dev><\/script>/);
});

test("snippet can opt into local persistence", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet", "--persist", "local"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-unship-persist="local"/);
});

test("snippet can inline the picker for local experiments", () => {
  const result = spawnSync(process.execPath, [CLI, "snippet", "--inline"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /<script data-unship-dev>/);
  assert.match(result.stdout, /__unshipPicker/);
});

test("setup next copies picker and injects dev-only script in app layout", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(
    join(cwd, "app", "layout.tsx"),
    `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`
  );

  const result = spawnSync(process.execPath, [CLI, "setup", "next", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.framework, "next");
  assert.equal(json.picker.path, "public/unship-picker.js");
  assert.equal(json.mount.status, "patched");
  assert.match(await readFile(join(cwd, "public", "unship-picker.js"), "utf8"), /__unshipPicker/);
  const layout = await readFile(join(cwd, "app", "layout.tsx"), "utf8");
  assert.match(layout, /import Script from "next\/script";/);
  assert.match(layout, /process\.env\.NODE_ENV === "development"/);
  assert.match(layout, /src="\/unship-picker\.js"/);

  const second = spawnSync(process.execPath, [CLI, "setup", "next", "--json"], { cwd, encoding: "utf8" });
  assert.equal(second.status, 0, second.stderr);
  const layoutAfterSecondRun = await readFile(join(cwd, "app", "layout.tsx"), "utf8");
  assert.equal(layoutAfterSecondRun.match(/unship-picker/g).length, 1);
});

test("setup refreshes an out-of-date picker file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { vite: "6.0.0" } }));
  await writeFixture(join(cwd, "index.html"), '<div id="root"></div>\n</body>\n');
  await writeFixture(join(cwd, "public", "unship-picker.js"), "old picker\n");

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.picker.status, "updated");
  assert.match(await readFile(join(cwd, "public", "unship-picker.js"), "utf8"), /__unshipPicker/);
});

test("setup auto detects vite and patches index html", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { vite: "6.0.0" } }));
  await writeFixture(join(cwd, "index.html"), '<div id="root"></div>\n</body>\n');

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.framework, "vite");
  assert.equal(json.mount.status, "patched");
  assert.match(await readFile(join(cwd, "public", "unship-picker.js"), "utf8"), /__unshipPicker/);
  assert.match(await readFile(join(cwd, "index.html"), "utf8"), /import\.meta\.env\.DEV/);
  assert.match(await readFile(join(cwd, "index.html"), "utf8"), /\/unship-picker\.js/);
});

test("setup astro patches a common layout when present", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { astro: "5.0.0" } }));
  await writeFixture(join(cwd, "src", "layouts", "Layout.astro"), "<html><body><slot /></body></html>\n");

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.framework, "astro");
  assert.equal(json.mount.status, "patched");
  assert.match(await readFile(join(cwd, "src", "layouts", "Layout.astro"), "utf8"), /import\.meta\.env\.DEV/);
});

test("setup sveltekit creates a client hook when none exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ devDependencies: { "@sveltejs/kit": "2.0.0" } }));

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.framework, "sveltekit");
  assert.equal(json.picker.path, "static/unship-picker.js");
  assert.equal(json.mount.status, "created");
  assert.match(await readFile(join(cwd, "src", "hooks.client.ts"), "utf8"), /import\.meta\.env\.DEV/);
});

test("setup nuxt creates a client plugin when none exists", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { nuxt: "4.0.0" } }));

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.framework, "nuxt");
  assert.equal(json.mount.status, "created");
  assert.match(await readFile(join(cwd, "plugins", "unship.client.ts"), "utf8"), /defineNuxtPlugin/);
});

test("setup angular copies picker and returns manual mount guidance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { "@angular/core": "19.0.0" } }));

  const result = spawnSync(process.execPath, [CLI, "setup", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.framework, "angular");
  assert.equal(json.picker.path, "src/assets/unship-picker.js");
  assert.equal(json.mount.status, "manual");
  assert.match(json.next.join("\n"), /localhost-only/);
  assert.match(await readFile(join(cwd, "src", "assets", "unship-picker.js"), "utf8"), /__unshipPicker/);
});

test("check command returns non-zero for source residue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check", "--json"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("check command plain output includes cleanup diagnostics", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    mkdir(join(cwd, "src"), { recursive: true }).then(() =>
      writeFile(join(cwd, "src", "App.jsx"), '<div data-unship-pick="Hero"></div>\n', "utf8")
    )
  );
  const result = spawnSync(process.execPath, [CLI, "check"], { cwd, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /src\/App\.jsx:1:6/);
  assert.match(result.stdout, /Remove temporary Unship picker markup/);
});

test("doctor reports package, project setup state, and residue", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));
  await writeFixture(join(cwd, ".agents", "skills", "unship", "SKILL.md"), "---\nname: unship\n---\n");
  await writeFixture(join(cwd, "public", "unship-picker.js"), "window.__unshipPicker = {};\n");
  await writeFixture(
    join(cwd, "app", "layout.tsx"),
    'import Script from "next/script";\nexport default function Layout({ children }) { return <body>{children}<Script src="/unship-picker.js" data-unship-dev /></body>; }\n'
  );
  await writeFixture(join(cwd, "app", "page.tsx"), 'export default function Page() { return <div data-unship-pick="Hero" />; }\n');

  const result = spawnSync(process.execPath, [CLI, "doctor", "--json"], { cwd, encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.packageName, "unship");
  assert.match(json.reminder, /local preview tooling/);
  assert.equal(json.project.framework, "next");
  assert.equal(json.project.skillInstalled, true);
  assert.equal(json.project.skillCurrent, false);
  assert.equal(json.project.pickerFileFound, true);
  assert.equal(json.project.pickerFileCurrent, false);
  assert.equal(json.project.devMountFound, true);
  assert.equal(json.residue.ok, false);
  assert.equal(json.residue.diagnostics.some((item) => item.file === "app/page.tsx"), true);
});

test("doctor reports a live preview server so agents can reuse it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "unship-cli-"));
  await writeFixture(join(cwd, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0" } }));

  await withServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<html><head><title>Existing Preview</title></head><body>ready</body></html>");
  }, async (port) => {
    const result = await runCli(["doctor", "--json", "--ports", String(port)], cwd);

    assert.equal(result.status, 0, result.stderr);
    const json = JSON.parse(result.stdout);
    assert.deepEqual(json.project.previewServers, [{
      url: `http://127.0.0.1:${port}`,
      port,
      status: 200,
      title: "Existing Preview"
    }]);
  });
});

test("doctor plain output reports doctor details", () => {
  const result = spawnSync(process.execPath, [CLI, "doctor"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unship 0\.1\.0/);
  assert.match(result.stdout, /local preview tooling/);
});
