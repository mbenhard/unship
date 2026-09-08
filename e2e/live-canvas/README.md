# Live Canvas local test build

Displays the original option nodes in the browser's top layer, preserving their DOM parents and live state. The adapter reuses the current picker and camera. It is a local candidate, not the default published runtime.

```sh
npm ci
npm ci --prefix e2e/live-canvas
node e2e/live-canvas/build.mjs
npm run demo
```

Open `http://127.0.0.1:4173/live-canvas`, then run:

```sh
node e2e/live-canvas/check-live.mjs
node e2e/live-canvas/check-edges.mjs
node e2e/live-canvas/check-wheel.mjs
node e2e/live-canvas/check-package.mjs
```

The first three checks accept `UNSHIP_LIVE_URL` for a different running preview. Generated scripts, screenshots and results go into ignored `.unship/live-canvas/`.

To produce a local installable candidate, commit the intended source and run:

```sh
node e2e/live-canvas/pack.mjs
```

This creates `.unship/releases/0.2.0-live.1/unship-cli-0.2.0-live.1.tgz`. It includes the live runtime and matching skill, with a source revision and runtime hash in package metadata. It has no fixture dependencies and is marked private to prevent accidental publishing. The normal package and plugin remain on the existing renderer until the experiment is accepted.

Install the tarball with `npm install -g <tarball>`, then use that executable for `unship install --repair --yes --no-project`. Existing projects still need their generated asset refreshed with `setup --out <existing-path> --src <existing-url> --force --json`; reload the browser afterward. Setup saves a backup. Preserve deliberate project pins. Downgrading uses the previous tarball followed by the same skill repair and asset refresh.

Known limitations: external portal menus may be obscured; cross-origin iframe wheel events cannot be bridged; independent responsive viewports are absent. Browser coverage is Chromium. See [report.md](report.md) for the evidence and remaining work. No performance or package-size improvement is claimed yet.
