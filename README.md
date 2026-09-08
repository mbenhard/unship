![Unship - iterate with your agent in the app, not in chat](https://raw.githubusercontent.com/mbenhard/unship/main/.github/assets/cover.png)

# Unship

Compare alternatives in your app with your coding agent.

Ask for UI, copy, or state variations. Browse them with the local picker, copy your choice, and paste it into your AI chat. The agent keeps the chosen source and removes the rest.

A single injected script. No runtime dependencies, accounts, or telemetry.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g @unship/cli
unship install
```

Restart your agent or reload its skills. If detection misses your agent, name it: `unship install codex`, `unship install claude`, or `unship install cursor`.

**0.2 is unreleased.** npm installs the published version. To try this checkout, follow [local installation](CONTRIBUTING.md#test-the-local-build).

## Use

```text
Use Unship to compare three hero copy directions, including the current one.
```

For side-by-side or responsive previews:

```text
Use Unship Canvas to compare three pricing-card layouts at desktop and mobile sizes.
```

Hold an option to copy your choice, then paste into your AI chat to apply it. You can also tell the agent which label to keep. Copying a choice does not edit source.

The agent handles setup and cleanup. Keep Unship out of production builds.

## Update

```bash
npm install -g @unship/cli@latest
unship install --repair
```

Reload the agent's skills afterward. Existing comparisons also need their copied picker refreshed by the agent; restarting alone does not update project files. When testing an unpublished build, install its exact tarball instead of `@latest`.

<details>
<summary>Other skill installers</summary>

Claude Code plugin:

```text
/plugin marketplace add mbenhard/unship
/plugin install unship@unship-marketplace
```

Or use the skills CLI: `npx skills add mbenhard/unship`.

For other agents, `unship install --print-skill` prints the instructions to place in their skill directory.

</details>

Run `unship --help` for manual commands.

[Website](https://unship.dev) · [Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/mbenhard/unship/issues/new/choose) · [MIT](LICENSE)
