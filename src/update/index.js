const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org";
const UPDATE_NEXT = "Run npx @unship/cli@latest install --repair to refresh managed Unship files.";

export async function checkForUpdates({
  packageName,
  currentVersion,
  disabled = false,
  registryUrl = process.env.UNSHIP_NPM_REGISTRY || DEFAULT_REGISTRY_URL,
  timeoutMs = 800,
  fetchImpl = globalThis.fetch
} = {}) {
  if (disabled) return { checked: false, reason: "disabled" };
  if (!packageName || !currentVersion || typeof fetchImpl !== "function") {
    return unavailable(currentVersion);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(registryPackageUrl(registryUrl, packageName), {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
    const body = await response.json();
    const latest = body?.["dist-tags"]?.latest || body?.version || null;
    if (!latest) throw new Error("npm registry response did not include a latest version");

    const comparison = compareVersions(currentVersion, latest);
    if (comparison === null) {
      return {
        checked: true,
        available: null,
        current: currentVersion,
        latest,
        comparison: "unknown"
      };
    }

    const available = comparison < 0;
    return {
      checked: true,
      available,
      current: currentVersion,
      latest,
      ...(available ? { next: UPDATE_NEXT } : {})
    };
  } catch {
    return unavailable(currentVersion);
  } finally {
    clearTimeout(timeout);
  }
}

export function compareVersions(current, latest) {
  const currentParsed = parseNumericVersion(current);
  const latestParsed = parseNumericVersion(latest);
  if (!currentParsed || !latestParsed) return null;
  for (let index = 0; index < 3; index += 1) {
    if (currentParsed.parts[index] < latestParsed.parts[index]) return -1;
    if (currentParsed.parts[index] > latestParsed.parts[index]) return 1;
  }
  if (currentParsed.clean !== latestParsed.clean) return null;
  return 0;
}

function parseNumericVersion(value) {
  const clean = String(value || "").trim().replace(/^v/i, "");
  const [core] = clean.split(/[+-]/);
  if (!/^\d+(?:\.\d+){0,2}$/.test(core)) return null;
  const parts = core.split(".").map((part) => Number(part));
  while (parts.length < 3) parts.push(0);
  return { clean, core, parts };
}

function registryPackageUrl(registryUrl, packageName) {
  return `${String(registryUrl || DEFAULT_REGISTRY_URL).replace(/\/+$/, "")}/${encodeURIComponent(packageName)}`;
}

function unavailable(currentVersion) {
  return {
    checked: true,
    available: null,
    current: currentVersion,
    latest: null,
    error: "unavailable"
  };
}
