@AGENTS.md

# Claude Notes

Use `AGENTS.md` as lightweight orientation only. This repo is still experimental, so verify current behavior in source, tests, and local docs when present before relying on remembered details.

`docs/` and `explorations/` are local-only working material and should stay out of the public GitHub repo unless that boundary is explicitly changed. Public truth belongs in README, RELEASE, CHANGELOG, source, tests, and bundled agent instructions.

For local internal testing, follow the `Internal Local Testing` section in `AGENTS.md`. Until this package is actually published under the intended npm name, prefer direct source commands in this repo and packed-tarball installs in consuming repos.

For release and publishing work, follow `RELEASE.md` plus the `Release And Publishing` and `Release Truth Rules` sections in `AGENTS.md`. Keep package contents constrained by `test/package-smoke.test.js`. The normal npm publish path is the GitHub `Publish` workflow with trusted publishing; local `npm whoami` may return `E401` and should not block publishing when the workflow is available.
