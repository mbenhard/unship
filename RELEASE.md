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
- `src/agent/index.js`
- `src/check/index.js`
- `src/cli/index.js`
- `src/picker/unship-picker.js`
- `src/setup/index.js`

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

## Publish

For the first public beta, prefer `next` before `latest`:

```bash
npm publish --tag next --access public
npm view @unship/cli dist-tags version
```

Smoke test from the registry:

```bash
npm exec @unship/cli@next -- doctor --json
npm exec @unship/cli@next -- snippet
```

Promote when satisfied:

```bash
npm dist-tag add @unship/cli@0.1.0 latest
```
