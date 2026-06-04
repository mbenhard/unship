# Release Process

This repo is intended to publish from GitHub and npm after the package name is resolved.

## Package Name

The clean npm name `unship` is currently taken by another maintainer. Release options:

1. Get npm maintainer access or a transfer for `unship`, then publish this package as `unship`.
2. Publish under a scope, such as `@mbenhard/unship` or `@unship/cli`, while keeping the binary name `unship`.
3. Publish an unscoped fallback, such as `unship-cli`, while keeping the binary name `unship`.

If the package name changes, update:

- `package.json` `name`
- `package-lock.json`
- README install commands
- `agent/skills/unship/SKILL.md` npx command examples
- CLI tests that assert `packageName`
- packed-tarball smoke commands in docs

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

## npm Login

Use browser login:

```bash
npm login --auth-type=web
npm whoami
```

Verify package access:

```bash
npm owner ls unship
npm access ls-packages
```

## Publish

For the first public beta, prefer `next` before `latest`:

```bash
npm publish --tag next --access public
npm view unship dist-tags version
```

Smoke test from the registry:

```bash
npm exec unship@next -- doctor --json
npm exec unship@next -- snippet
```

Promote when satisfied:

```bash
npm dist-tag add unship@0.1.0 latest
```

If publishing under a scoped fallback, replace `unship` with the chosen package name in the npm commands.
