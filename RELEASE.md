# Release Process

This repo publishes from GitHub as `mbenhard/unship` and from npm as `@unship/cli`. The installed binary is `unship`.

## Package Name

Current package:

- npm package: `@unship/cli`
- binary: `unship`
- fresh command: `npx @unship/cli@latest doctor --json`
- local project command after install: `./node_modules/.bin/unship doctor --json`

The clean unscoped npm name `unship` is currently taken by another maintainer. If it is transferred later, update package metadata, README commands, bundled skill fallback commands, tests that assert `packageName`, and packed-tarball docs in one coherent change.

## Preflight

```bash
git status --short
npm ci
npm run verify
npm publish --dry-run
```

The package should publish only these files:

- `LICENSE`
- `README.md`
- `agent/AGENTS.md`
- `agent/skills/unship/SKILL.md`
- `package.json`
- `src/agent-targets/index.js`
- `src/agent/index.js`
- `src/check/index.js`
- `src/cli/index.js`
- `src/install/index.js`
- `src/picker/unship-picker.js`
- `src/project-files/index.js`
- `src/setup/index.js`
- `src/update/index.js`

The `files` array in `package.json` and `test/package-smoke.test.js` enforce this.

## GitHub

Create the public repo when ready:

```bash
gh repo create mbenhard/unship --public --source=. --remote=origin --push
```

If `origin` already exists, verify it first:

```bash
git remote -v
gh repo view --json nameWithOwner,url,visibility,isPrivate
```

## npm Scope

The npm CLI cannot create an org/scope. Before publishing, create or claim the `@unship` npm org in the npm website, then add npm user `benhard` as owner/admin.

Verify:

```bash
npm whoami
npm org ls unship --json
npm access list packages @unship --json
```

Local `npm whoami` may return `E401` on this machine. That does not block the normal publish path when GitHub trusted publishing is configured; use the GitHub `Publish` workflow below.

## Publish

Default path: publish from GitHub Actions using npm trusted publishing.

```bash
gh workflow run publish.yml --ref main -f tag=latest
gh run watch <run-id> --exit-status
npm view @unship/cli@latest version dist-tags gitHead --json
```

Use `tag=next` instead of `tag=latest` when intentionally publishing a prerelease channel.

Smoke test from the registry after the workflow succeeds:

```bash
npm exec @unship/cli@latest -- install --dry-run --json --no-update-check
npm exec @unship/cli@latest -- doctor --json --no-update-check
npm exec @unship/cli@latest -- snippet
npm exec @unship/cli@latest -- setup --json
```

After publishing, refresh this machine's installed agent files so local Codex and Claude Code load the new bundled skill after restart:

```bash
npm exec @unship/cli@latest -- install --repair --yes --no-project --no-update-check
npm exec @unship/cli@latest -- install --dry-run --json --no-update-check
```
