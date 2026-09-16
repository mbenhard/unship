![Unship - iterate with your agent in the app, not in chat](https://raw.githubusercontent.com/mbenhard/unship/main/.github/assets/cover.png)

# Unship

Compare alternatives in your app with your coding agent.

Ask for UI, copy, or state variations. Browse them with the local picker, copy your choice, and paste it into your AI chat. The agent follows your direction in source.

A single injected script. No runtime dependencies, accounts, or telemetry. Free and MIT licensed.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g @unship/cli
unship install
```

Restart your agent or reload its skills. If detection misses your agent, name it: `unship install codex`, `unship install claude`, or `unship install cursor`.

**New in 0.2:** live Canvas, broader agent installation, and safer picker updates. See the [release notes](CHANGELOG.md).

**0.2.1:** Cmd + scroll now zooms Canvas on Mac, alongside Ctrl + scroll and pinch. Native browser wheel zoom stays suppressed while Canvas is open.

## Use

```text
Use Unship to compare three hero copy directions, including the current one.
```

Open **Canvas** from the picker to compare alternatives together. Pan, zoom, switch the Canvas theme, and interact with the original components. State and event handlers stay with the actual app; Canvas does not clone or restart it.

Use stacked sections or a grid of smaller components. All options share your browser viewport, so resize the browser for responsive testing. Canvas requires the Popover API. App-owned option-root popovers/dialogs stay on the page, and detected external overlays return you there. Custom portals and cross-origin iframe gestures may need page-level testing.

![Live Canvas compares the original running components](https://raw.githubusercontent.com/mbenhard/unship/main/.github/assets/canvas.png)

Tell the agent what to change or keep, or hold an option to copy its selection into your AI chat. Copying identifies the option; your instructions determine what happens next.

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
