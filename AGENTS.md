# Project Context

Unship is experimental local UI variant tooling. The current direction is temporary source-level UI choices plus a local browser picker, but this project is still moving, so treat this file as orientation, not a spec.

Before implementation work, verify current behavior in the live repo:

- `package.json` for package shape, scripts, and runtime constraints.
- `README.md` for public product direction.
- `docs/README.md` only when the local private docs folder exists.
- `src/` for implementation truth.
- `test/` for expected behavior and edge cases.
- `agent/` for bundled instructions installed into consuming projects.

## Stable Principles

- Keep preview tooling local and temporary unless the current specs say otherwise.
- Prefer small, direct code and avoid runtime dependencies without a clear reason.
- Do not assume historical patch-session ideas are active; if local `docs/README.md` exists, check it before carrying old concepts forward.
- Treat agent instructions as product surface. Changes to installed skills, memory files, or command shims should be covered by tests.
- Keep slash commands and root instruction files as thin pointers to the bundled skill. Do not duplicate workflow, command sequences, or historical assumptions outside `agent/skills/unship/SKILL.md` unless tests cover the generated output.
- Keep root `AGENTS.md` and `CLAUDE.md` lightweight. Put detailed behavior in source, tests, README, or docs where it can evolve deliberately.

## Public Repo Boundary

`docs/` and `explorations/` are local working material, not public GitHub surface. Keep them ignored and local unless the project direction explicitly changes. User-facing and contributor-facing truth should live in `README.md`, `RELEASE.md`, `CHANGELOG.md`, source, tests, or bundled agent instructions.

Do not rely on local-only docs for behavior that users or external contributors need. If a local plan affects product behavior, either encode it in source/tests or summarize the durable decision in a tracked public file.

## Release Truth Rules

The package may be ahead of npm before first publish. In that state, use `CHANGELOG.md` `Unreleased` entries instead of pretending a version has shipped.

When changing package contents, commands, package name, binary name, or version, update the full release truth set in one coherent change:

- `package.json` and `package-lock.json` when package metadata changes.
- `README.md`, `RELEASE.md`, `CHANGELOG.md`, and `CONTRIBUTING.md` when commands, versions, or release workflow examples change.
- `agent/skills/unship/SKILL.md` and `src/agent/index.js` when installed agent behavior or generated shims change.
- `test/package-smoke.test.js` when the intended published file list changes.

Before claiming a release or publish is complete, verify with `npm run verify`, `npm publish --dry-run`, and registry smoke tests after publish.

## Internal Local Testing

The package is published as `@unship/cli`, but local development may be ahead of npm. Do not use the public registry as the source of truth while developing or dogfooding unpublished changes.

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
rm -f /tmp/unship-pack/unship-cli-*.tgz
npm pack --pack-destination /tmp/unship-pack

cd /path/to/consuming-app
npm install -D /tmp/unship-pack/unship-cli-*.tgz
./node_modules/.bin/unship doctor --json
./node_modules/.bin/unship init --force
./node_modules/.bin/unship setup --json
```

After installing the packed tarball, use `./node_modules/.bin/unship ...` for release proof so npm never resolves the unrelated public package named `unship` and local unpublished changes are exercised.

`npm link` is acceptable for fast manual iteration, but do not treat it as release proof. Always validate the packed tarball before calling a local test complete.

## Verification

Run `npm run verify` for implementation changes. For docs-only changes, at least run:

```bash
git diff --check
```

`unship check` is for consuming app roots after a variant exploration. Running it from this package repo is expected to report intentional Unship strings in the implementation and tests.

For changes to `install`, `uninstall`, `install-skill`, generated skills, memory files, or command shims, also verify the temp-home and packed-tarball path so harness discovery, stale-file repair, and generated output are exercised outside this checkout.

## Release And Publishing

Before release or publish work, read `RELEASE.md` first. The current npm package name is `@unship/cli`, with binary `unship`. If the package name changes, update `package.json`, `package-lock.json`, README commands, bundled skill command examples, tests that assert `packageName`, and packed-tarball smoke docs in one coherent change.

Publishing gates:

- `git status --short` must be clean except intentional local ignored/untracked scratch dirs.
- `npm run verify` must pass.
- `npm publish --dry-run` must pass without package-manifest warnings.
- The packed package contents must remain limited to the files asserted in `test/package-smoke.test.js`.
- Publish through the GitHub `Publish` workflow by default: `gh workflow run publish.yml --ref main -f tag=latest`, then watch the run to completion. Local `npm whoami` returning `E401` is expected on this machine and does not block trusted publishing.
- Publish with the dist-tag requested in `RELEASE.md` or by the user, then run the registry smoke tests and refresh local installed agent files before calling the release complete.

For GitHub, use `mbenhard/unship` unless the user explicitly chooses another owner or repository name.
