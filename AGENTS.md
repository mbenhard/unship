# Project Context

Unship is experimental local UI variant tooling. The current direction is temporary source-level UI choices plus a local browser picker, but this project is still moving, so treat this file as orientation, not a spec.

Before implementation work, verify current behavior in the live repo:

- `package.json` for package shape, scripts, and runtime constraints.
- `README.md` and `docs/README.md` for the current product direction.
- `src/` for implementation truth.
- `test/` for expected behavior and edge cases.
- `agent/` for bundled instructions installed into consuming projects.

## Stable Principles

- Keep preview tooling local and temporary unless the current specs say otherwise.
- Prefer small, direct code and avoid runtime dependencies without a clear reason.
- Do not assume historical patch-session ideas are active; check `docs/README.md` before carrying old concepts forward.
- Treat agent instructions as product surface. Changes to installed skills, memory files, or command shims should be covered by tests.
- Keep root `AGENTS.md` and `CLAUDE.md` lightweight. Put detailed behavior in source, tests, README, or docs where it can evolve deliberately.

## Internal Local Testing

This package is not assumed to be published on npm yet. Do not use the public registry as the source of truth while developing or dogfooding it locally.

When testing inside this repo, prefer direct source commands:

```bash
npm run verify
node src/cli/index.js doctor --json
node src/cli/index.js snippet
node src/cli/index.js check --json --root /path/to/consuming-app
```

When testing in another repo, first install this package locally from a packed tarball:

```bash
cd /Users/marcusbenhard/Development/Playground/unship-design
mkdir -p /tmp/unship-pack
npm pack --pack-destination /tmp/unship-pack

cd /path/to/consuming-app
npm install -D /tmp/unship-pack/unship-0.1.0.tgz
npx unship doctor --json
npx unship init --force
npx unship setup --json
```

After `npm install -D /tmp/unship-pack/unship-0.1.0.tgz`, `npx unship ...` should resolve to the consuming repo's local `node_modules/.bin/unship`. If that is unclear, use `./node_modules/.bin/unship ...` to avoid accidentally testing a registry package.

`npm link` is acceptable for fast manual iteration, but do not treat it as release proof. Always validate the packed tarball before calling a local test complete.

## Verification

Run `npm run verify` for implementation changes. For docs-only changes, at least run:

```bash
git diff --check
```

`npx unship check` is for consuming app roots after a variant exploration. Running it from this package repo is expected to report intentional Unship strings in the implementation and tests.
