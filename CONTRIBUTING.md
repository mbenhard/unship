# Contributing

```bash
npm ci
npx playwright install chromium
npm run verify
```

Run `npm run demo` and open <http://127.0.0.1:4173>. The playground serves the current picker; refresh after edits. `/canvas` is the focused Canvas fixture. Set `PORT` to use another port.

## Structure

- `src/` — CLI, setup, installation, checks, and the injected picker.
- `agent/` — bundled agent instructions.
- `plugin/` — Claude Code skill distribution; keep its skill identical to `agent/skills/unship/SKILL.md`.
- `test/` — behavior and package tests.
- `e2e/` — browser checks and local preview fixtures; excluded from npm.

## Test the local build

```bash
npm pack
npm install -g ./unship-cli-0.2.0.tgz
unship install --repair --yes --no-project
```

Before the global install, verify that the existing `unship` executable belongs to `@unship/cli`; preserve unrelated tools using that name. Reload the agent's skill afterward. Use this installed build throughout local testing.

In a consuming app, prepare the runtime at its existing served path:

```bash
unship setup --out public/unship-picker.js --src /unship-picker.js --json
```

These paths are examples. Setup returns the dev-only script tag to mount once. Identical files are unchanged; differing files require `--force` and receive a backup. For embedded HTML use `setup --inline --json`. Reload or rebuild the actual preview after an update.

Compare, iterate, choose, and clean up in a real app. Verify final cleanup with `unship check --json` and the app's build. Preserve recovery backups and unrelated changes.

## Changes

Prefer direct code and tests of observable behavior. Keep runtime dependencies at zero unless a concrete need justifies one. Treat the installed skill as part of the product and test instruction changes through realistic agent requests.

Run `npm run verify` before review. See [release instructions](.github/RELEASING.md) for publishing and [terminology](CONTEXT.md) for shared names.
