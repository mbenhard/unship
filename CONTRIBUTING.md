# Contributing

Thanks for helping improve Unship.

## Development

```bash
npm ci
npm run verify
```

Unship is intentionally small. Prefer direct code, no runtime dependencies, and tests that cover agent-facing behavior.

## Local Package Testing

Do not use the public registry as the source of truth while developing locally.

```bash
mkdir -p /tmp/unship-pack
npm pack --pack-destination /tmp/unship-pack

cd /path/to/consuming-app
npm install -D /tmp/unship-pack/unship-cli-*.tgz
./node_modules/.bin/unship doctor --json
./node_modules/.bin/unship init --force --json
./node_modules/.bin/unship setup --json
```

## Pull Requests

- Keep preview tooling local and temporary.
- Treat `agent/skills/unship/SKILL.md` as product surface.
- Add or update tests for CLI output, generated instructions, setup behavior, scanner behavior, and picker behavior when relevant.
- Run `npm run verify` before asking for review.

## Release Changes

For release process details, see `RELEASE.md`.
