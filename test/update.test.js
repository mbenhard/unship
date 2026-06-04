import assert from "node:assert/strict";
import test from "node:test";
import { checkForUpdates, compareVersions } from "../src/update/index.js";

function response(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return body;
    }
  };
}

test("compareVersions handles numeric npm versions", () => {
  assert.equal(compareVersions("0.1.1", "0.1.2"), -1);
  assert.equal(compareVersions("0.1.2", "0.1.1"), 1);
  assert.equal(compareVersions("0.1.1", "0.1.1"), 0);
  assert.equal(compareVersions("v0.1.1", "0.1.1"), 0);
  assert.equal(compareVersions("0.1.1-beta.1", "0.1.1"), null);
  assert.equal(compareVersions("not-a-version", "0.1.1"), null);
});

test("checkForUpdates reports a newer npm latest version", async () => {
  let requestedUrl = "";
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response({ "dist-tags": { latest: "0.1.2" } });
    }
  });

  assert.equal(requestedUrl.endsWith("/%40unship%2Fcli"), true);
  assert.deepEqual(result, {
    checked: true,
    available: true,
    current: "0.1.1",
    latest: "0.1.2",
    next: "Run npx @unship/cli@latest install --repair to refresh managed Unship files."
  });
});

test("checkForUpdates reports current when latest matches", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async () => response({ "dist-tags": { latest: "0.1.1" } })
  });

  assert.deepEqual(result, {
    checked: true,
    available: false,
    current: "0.1.1",
    latest: "0.1.1"
  });
});

test("checkForUpdates can be disabled", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    disabled: true,
    fetchImpl: async () => {
      throw new Error("should not fetch");
    }
  });

  assert.deepEqual(result, {
    checked: false,
    reason: "disabled"
  });
});

test("checkForUpdates degrades quietly when npm is unavailable", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1",
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });

  assert.deepEqual(result, {
    checked: true,
    available: null,
    current: "0.1.1",
    latest: null,
    error: "unavailable"
  });
});

test("checkForUpdates reports unknown comparison without claiming an update", async () => {
  const result = await checkForUpdates({
    packageName: "@unship/cli",
    currentVersion: "0.1.1-beta.1",
    fetchImpl: async () => response({ "dist-tags": { latest: "0.1.1" } })
  });

  assert.deepEqual(result, {
    checked: true,
    available: null,
    current: "0.1.1-beta.1",
    latest: "0.1.1",
    comparison: "unknown"
  });
});
