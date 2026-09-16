# Releasing

The npm package is `@unship/cli`; its executable is `unship`. Publishing requires an explicit release decision.

1. Update the version in `package.json`, `package-lock.json`, the picker API, `plugin/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`. Update the changelog, README release status, and local-install example.
2. Run `npm ci`, `npm run verify`, and `npm publish --dry-run`. Verification includes the live React fixture and exact-tarball lifecycle; its dependencies remain outside the published package. The package file list is enforced by `test/package-smoke.test.js`; keep generated artifacts and plugin-only files out of npm.
3. Test the exact tarball in a real app through comparison, iteration, and cleanup. See [local installation](../CONTRIBUTING.md#test-the-local-build). Keep deliberate project pins and unpublished builds separate from npm `@latest`.
4. Merge the approved changes to `main` and confirm CI passes.
5. Publish through GitHub Actions using the configured npm trusted publisher:

```bash
gh workflow run publish.yml --ref main -f tag=latest
gh run watch <run-id> --exit-status
npm view @unship/cli@latest version dist-tags gitHead --json
```

Use `tag=next` for an intentional prerelease. Publishing a GitHub release also triggers this workflow; use one publishing path per version.

Smoke-test the published package in a temporary app. Then update the local CLI and refresh its installed instructions:

```bash
npm install -g @unship/cli@latest
unship install --repair --yes --no-project
```

Reload the agent's skills. Existing project copies still need `setup --out <existing-served-file>` and a preview reload; an instruction refresh does not update them.
