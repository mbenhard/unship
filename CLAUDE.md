@AGENTS.md

# Claude Notes

Use `AGENTS.md` as lightweight orientation only. This repo is still experimental, so verify current behavior in source, tests, and docs before relying on remembered details.

For local internal testing, follow the `Internal Local Testing` section in `AGENTS.md`. Until this package is actually published under the intended npm name, prefer direct source commands in this repo and packed-tarball installs in consuming repos.

For release and publishing work, follow `RELEASE.md` and the `Release And Publishing` section in `AGENTS.md`. Verify `@unship` npm org/scope access before publishing, and keep package contents constrained by `test/package-smoke.test.js`.
