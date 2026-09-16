# Live Canvas regression fixture

This React fixture runs the actual shipped picker. It exercises live state, DOM identity, embedded frames, canvas pixels, shadow DOM, portal fallback, and wheel handling.

```sh
npm ci
npm ci --prefix e2e/live-canvas
node e2e/live-canvas/build.mjs
npm run demo
```

With the preview running, execute:

```sh
node e2e/live-canvas/check-live.mjs
node e2e/live-canvas/check-edges.mjs
node e2e/live-canvas/check-wheel.mjs
node e2e/live-canvas/check-package.mjs
```

The first three checks accept `UNSHIP_LIVE_URL`. Generated bundles, screenshots, and results go into ignored `.unship/live-canvas/`. The package check installs an exact release tarball in a temporary app. Fixture dependencies and probes are excluded from npm.

All options use the browser's viewport. The test-only width probe demonstrates that container queries respond to component width while viewport media queries require an actual browser resize.
