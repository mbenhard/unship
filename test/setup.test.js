import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { setupProject, inspectProject, pickerSnippet } from "../src/setup/index.js";
import { checkUnshipResidue } from "../src/check/index.js";

const source = await readFile(new URL("../src/picker/unship-picker.js", import.meta.url), "utf8");

test("explicit setup creates exact bytes, preserves a current file, and backs up a same-version different build", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-setup-"));
  const out = "public/custom-picker.js";
  const path = join(root, out);
  const options = { root, out, src: "/custom-picker.js" };
  const preview = await setupProject({ ...options, dryRun: true });
  assert.equal(preview.picker.status, "would-create");
  assert.equal(preview.picker.current, false);
  await assert.rejects(stat(path), { code: "ENOENT" });
  const created = await setupProject(options);
  assert.equal(created.picker.status, "created");
  assert.equal(created.picker.current, true);
  assert.equal(await readFile(path, "utf8"), source);
  assert.ok(JSON.stringify(created).length < 2000, "ordinary setup must not print the runtime");
  const before = await stat(path);
  assert.equal((await setupProject(options)).picker.status, "current");
  assert.equal((await stat(path)).mtimeMs, before.mtimeMs);

  // The package version still matches; freshness must compare contents.
  const customized = source + "\n// local modification\n";
  await writeFile(path, customized);
  assert.equal((await setupProject(options)).ok, false);
  assert.equal(await readFile(path, "utf8"), customized);
  const dryRepair = await setupProject({ ...options, force: true, dryRun: true });
  assert.equal(dryRepair.picker.status, "would-update");
  assert.equal(dryRepair.picker.current, false);
  await assert.rejects(stat(join(root, ".unship")), { code: "ENOENT" });
  const repaired = await setupProject({ ...options, force: true });
  assert.equal(repaired.picker.status, "updated");
  assert.equal(await readFile(repaired.picker.backup, "utf8"), customized);
  assert.equal(await readFile(path, "utf8"), source);

  await writeFile(join(root, "index.html"), created.mount.snippet);
  const inspected = await inspectProject({ root, out });
  assert.equal(inspected.pickerCurrent, true);
  assert.equal(inspected.pickerFileCurrent, true);
  assert.equal(inspected.devMountFile, "index.html");
  assert.deepEqual(inspected.previewServers, []);
  const residue = await checkUnshipResidue({ root });
  assert.ok(residue.diagnostics.some((d) => d.file === "index.html" && d.pattern === "data-unship-dev"));
  assert.ok(residue.diagnostics.every((d) => !d.file.startsWith(".unship/")));
});

test("setup never follows a destination symlink or overwrites a directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-setup-"));
  await writeFile(join(root, "original.js"), "custom");
  await symlink(join(root, "original.js"), join(root, "link.js"));
  for (const out of ["link.js", "."]) {
    await assert.rejects(setupProject({ root, out, force: true }), /regular file/);
  }
  assert.equal(await readFile(join(root, "original.js"), "utf8"), "custom");
});

test("inline and external snippets share options and inline freshness is verifiable", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-inline-"));
  const options = { persist: "local", globalShortcuts: true };
  const embedded = await setupProject({ root, inline: true, ...options });
  const external = await pickerSnippet({ src: '/custom.js?a="<&', ...options });
  for (const snippet of [embedded.mount.snippet, external]) {
    assert.match(snippet, /data-unship-persist="local"/);
    assert.match(snippet, /data-unship-global-shortcuts/);
  }
  assert.match(external, /&quot;&lt;&amp;/);
  const path = join(root, "preview.html");
  await writeFile(path, `<html><body>${embedded.mount.snippet}</body></html>`);
  assert.equal((await inspectProject({ root, out: "preview.html", inline: true })).pickerCurrent, true);
  assert.equal((await inspectProject({ root })).pickerCurrent, true);
  await writeFile(path, embedded.mount.snippet.replace("if (window.__unshipPicker) return;", "// old runtime"));
  assert.equal((await inspectProject({ root, out: "preview.html", inline: true })).pickerCurrent, false);
  await writeFile(path, '<script data-unship-dev src="/custom.js"></script>');
  assert.equal((await inspectProject({ root, out: "preview.html", inline: true })).pickerCurrent, null);
  await assert.rejects(setupProject({ root, out: "picker.js", inline: true }), /not both/);
});

test("missing explicit destinations stay unknown and do not fall back to a different picker", async () => {
  const root = await mkdtemp(join(tmpdir(), "unship-setup-"));
  await setupProject({ root, out: "public/unship-picker.js" });
  const result = await inspectProject({ root, out: "public/not-this-one.js" });
  assert.equal(result.pickerFileFound, false);
  assert.equal(result.pickerCurrent, null);
  await writeFile(join(root, "other.html"), (await setupProject({ inline: true })).mount.snippet);
  for (const inline of [false, true]) {
    assert.equal((await inspectProject({ root, out: "missing.html", inline })).pickerCurrent, null);
  }
});
