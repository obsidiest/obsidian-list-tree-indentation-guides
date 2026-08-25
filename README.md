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

## Feature Preview

List Static Indentation Guides - List Indentation Guides Plugin
<img width="1009" height="1259" alt="List Static Indentation Guides - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/107a5228-8d82-4ffe-85d0-2871840102bc" />

Active List Item Threading - List Indentation Guides Plugin
<img width="925" height="904" alt="Active List Item Threading - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/e3afec0b-8ad3-4668-b156-1f0d9ed1bc99" />

All Branches of an Active List Threading - List Indentation Guides Plugin
<img width="846" height="925" alt="All Branches of an Active List Threading - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/ffecb7d2-9c57-42bb-a931-3890a0cf7362" />

Active List Item Threading - Orphan List - List Indentation Guides Plugin
<img width="888" height="625" alt="Active List Item Threading - Orphan List - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/17eebc25-1c7e-4676-8487-5da2a5d1052f" />

All Branches of an Active List Threading - Orphan List - List Indentation
<img width="812" height="828" alt="All Branches of an Active List Threading - Orphan List - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/33352030-3e94-45d1-9c4e-a80d200a6a8b" />


## Features

- Connected tree guides for ordered, unordered, mixed, and task lists.
- A global static-guide toggle plus independent rendering toggles for Live Preview, Source mode, and Reading mode.
- Separate list blocks remain visually separate across both content and blank-line boundaries by default, with an optional continuation/gutter-spine setting.
- Optional Logseq-style list threading that responds across the full hovered list-item row.
- Independent active-item-path and all-branches threading subfeatures, each with its own optional blank-line block threading.
- Threading from an immediately preceding non-bulleted/numbered list head.
- Dedicated active-item and all-branches threading controls for orphan ordered and unordered list blocks.
- A global threading toggle plus independent Live Preview, Source, and Reading-mode threading toggles.
- Searchable settings, including aliases for common mode names.
- Pop-out-window support.
- Minimal-theme-compatible styling based on Obsidian variables.
- Style Settings customization with exact numeric entry alongside every slider.
- Unordered-list markers are visible by default and can be suppressed from Style Settings.

## Plugin settings

Every plugin setting is searchable from Obsidian's Settings search. List static tree-guide rendering and all three mode preferences are enabled by default. Connecting separate list blocks is disabled by default. List Threading is globally disabled by default; Active List Item Threading, threading from an unmarked list head, Active Orphan List Threading, Active Orphan List Item Threading, and the three mode preferences are enabled so they take effect immediately if the global feature is enabled. Both all-branches options and both blank-line list-block options are disabled by default.

| Setting | Purpose |
| --- | --- |
| Enable list static tree indentation guides | Globally enables or disables the always-visible tree guides. Enabled by default. |
| Render in Live Preview | Shows guides in the editable Live Preview view. |
| Render in Source mode | Shows guides alongside raw Markdown list syntax. |
| Render in Reading mode | Shows guides in rendered Markdown. |
| Connect separate list blocks | Lets continuation/gutter spines bridge non-list content between editor list blocks. Disabled by default. |
| Enable list threading | Enables Logseq-style hover highlighting. |
| Active List Item Threading | Highlights the complete ancestor path to the hovered list item. Enabled by default. |
| Thread separate list blocks that are only separated by a blank line (Active Item) | Lets an active-item path continue into an adjacent blank-line-separated list block. Disabled by default. |
| All Branches of an Active List Threading | Highlights every branch in the hovered item’s list block. Disabled by default. |
| Thread separate list blocks that are only separated by a blank line (All Branches) | Lets All Branches include adjacent blank-line-separated blocks. Disabled by default; nonblank content always separates threading blocks. |
| List threading from a non-bulleted/numbered list head | Extends Active Item and All Branches threading from the immediately preceding unmarked line. Enabled by default. |
| Active Orphan List Threading | Enables threading for top-level ordered or unordered list blocks without an unmarked list head. Enabled by default. |
| Active Orphan List Item Threading | Highlights the path to the hovered item in an orphan list. Enabled by default. |
| All Branches of an Active Orphan List Threading | Highlights every branch in the active orphan list block. Disabled by default. |
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
- Active-item and all-branches thread opacity, thickness, line caps, and corner radius.
- Thread connector length, marker gap, and vertical offset.
- Eight independently themed list-thread colors, each with an enabled-by-default toggle; deeper levels reuse the eighth color.
- An enabled-by-default global fallback for disabled list-thread colors and a disabled-by-default global override with independently persisted light- and dark-mode native color inputs.
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

The list-threading interaction and rendered-list geometry are adapted from the MIT-licensed [obsidiest/obsidian-bullet](https://github.com/obsidiest/obsidian-bullet) fork.

## License

MIT
