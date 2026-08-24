# List Tree Indentation Guides

List Tree Indentation Guides renders nested Obsidian lists as a visually connected tree. Each sibling group receives a continuous vertical spine, and each ordered, unordered, or task-list item receives a horizontal connector.

```text
Example
├─ Example
│  ├─ Example
│  ├─ Example
│  │  └─ Example
│  └─ Example
└─ Example
   └─ Example
```

The implementation is scoped to rendered list items and CodeMirror's visible `HyperMD-list-line-N` rows. It measures the markers already rendered by Obsidian, coalesces editor updates to animation frames, and never scans the vault.

## Features

- Connected tree guides for ordered, unordered, mixed, and task lists.
- Independent rendering toggles for Live Preview, Source mode, and Reading mode.
- Optional Logseq-style bullet threading that highlights the complete ancestor path to the hovered list item.
- A global threading toggle plus independent Live Preview, Source, and Reading-mode threading toggles.
- Searchable settings, including aliases for common mode names.
- Pop-out-window support.
- Minimal-theme-compatible styling based on Obsidian variables.
- Style Settings customization with exact numeric entry alongside every slider.
- Unordered-list markers are visible by default and can be suppressed from Style Settings.

## Plugin settings

Every plugin setting is searchable from Obsidian's Settings search. Tree-guide rendering is enabled in all three modes by default. Bullet threading is disabled by default; its three mode preferences are enabled so they take effect immediately if the global feature is enabled.

| Setting | Purpose |
| --- | --- |
| Render in Live Preview | Shows guides in the editable Live Preview view. |
| Render in Source mode | Shows guides alongside raw Markdown list syntax. |
| Render in Reading mode | Shows guides in rendered Markdown. |
| Enable bullet threading | Highlights the nested path to the list item currently hovered over. |
| Thread in Live Preview | Allows threading in Live Preview when the global feature is enabled. |
| Thread in Source mode | Allows threading in Source mode when the global feature is enabled. |
| Thread in Reading mode | Allows threading in Reading mode when the global feature is enabled. |

## Style Settings

Install and enable the community plugin **Style Settings** to customize:

- Guide color.
- Guide opacity.
- Guide thickness.
- Horizontal connector length.
- Gap before the list marker or content.
- First-branch vertical rise.
- Connector vertical offset.
- Reading-mode vertical overlap.
- Solid, dashed, or dotted guide pattern.
- Dash and dot spacing.
- Visibility of unordered-list bullets in Live Preview and Reading mode (enabled by default).
- Thread opacity, thickness, line caps, and corner radius.
- Thread connector length, marker gap, and vertical offset.
- Eight independently themed thread colors; deeper levels reuse the eighth color.
- Reading-mode thread row height, segment overlap, parent reach, and marker offset.

Every numerical Style Settings slider receives a synchronized editable field. Typed in-range decimals are preserved exactly, including transient input such as `1.` while editing; invalid or incomplete values revert only when editing finishes.

## Installation

### From a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Create `<vault>/.obsidian/plugins/list-tree-indentation-guides/`.
3. Copy the three files into that folder.
4. Reload Obsidian and enable **List Tree Indentation Guides** under **Community plugins**.

### Build from source

```bash
npm ci
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into the plugin folder in the vault.

## Compatibility

- Requires Obsidian 1.13.0 or newer.
- Supports desktop and mobile.
- Designed to coexist with Minimal theme and its Style Settings controls.

## Development checks

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --exit-code -- main.js
```

The release workflow validates the clean build, confirms that committed `main.js` is current, creates the three standard Obsidian release assets, and publishes GitHub artifact attestations for each asset.

## Acknowledgements

The bullet-threading interaction and rendered-list geometry are adapted from the MIT-licensed [obsidiest/obsidian-bullet](https://github.com/obsidiest/obsidian-bullet) fork.

## License

MIT
