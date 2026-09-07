# Contributing

Thanks for helping improve Unship.

## Development

```bash
npm ci
npx playwright install chromium
npm run verify
```

Unship is intentionally small. Prefer direct code, no runtime dependencies, and tests that cover agent-facing behavior.

## Interactive Playground

Run `npm run demo` and open `http://127.0.0.1:4173`. Set `PORT` to use a different port. The server binds to loopback only and serves the current checkout's picker without caching; refresh after edits.

The mock Fieldwork workspace covers three Welcome variants, Activity states, and a single-option Note card with all tuning control types across the page. Compare, tune, reset, switch groups, copy a keep instruction, drag, and minimize. The textarea lets you inspect clipboard output without sending anything. Reload resets choices and tuning, while toolbar placement remains local.

The fixture and server live in `e2e/` and are excluded from the npm package.

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
