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

With their corresponding toggles enabled:

List Static Tree Indentation Guides
<img width="1009" height="1259" alt="List Static Tree Indentation Guides - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/107a5228-8d82-4ffe-85d0-2871840102bc" />

Active List Item Threading
<img width="925" height="904" alt="Active List Item Threading - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/e3afec0b-8ad3-4668-b156-1f0d9ed1bc99" />

All Branches of an Active List Threading
<img width="846" height="925" alt="All Branches of an Active List Threading - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/ffecb7d2-9c57-42bb-a931-3890a0cf7362" />

Active List Item Threading - Orphan List
<img width="888" height="625" alt="Active List Item Threading - Orphan List - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/17eebc25-1c7e-4676-8487-5da2a5d1052f" />

All Branches of an Active List Threading - Orphan List
<img width="812" height="828" alt="All Branches of an Active List Threading - Orphan List - List Indentation Guides Plugin" src="https://github.com/user-attachments/assets/33352030-3e94-45d1-9c4e-a80d200a6a8b" />

## Features

- Connected tree guides for ordered, unordered, mixed, and task lists.
- A global static-guide toggle plus independent rendering toggles for Live Preview, Source mode, and Reading mode.
- Separate list blocks remain visually separate across both content and blank-line boundaries by default, with an optional continuation/gutter-spine setting.
- Optional Logseq-style list threading that responds across the full hovered list-item row or, in editor modes, the active caret line.
- A disabled-by-default Active Cursor List Threading override that changes regular and orphan list activation from hover to the focused editor caret in Live Preview and Source mode.
- Independent active-item-path and all-branches threading subfeatures, each with its own optional blank-line block threading.
- Threading from an immediately preceding non-bulleted/numbered list head.
- Dedicated active-item and all-branches threading controls for orphan ordered and unordered list blocks.
- A global threading toggle plus independent Live Preview, Source, and Reading-mode threading toggles.
- Searchable settings, including aliases for common mode names.
- Pop-out-window support.
- Minimal-theme-compatible styling based on Obsidian variables.
- Style Settings customization with exact numeric entry alongside every slider.
- Unordered-list markers are visible by default and can be suppressed from Style Settings.
- Measured static guides and threading inside internal heading and block embeds, with an isolated overlay for each rendered surface.
- List Hover Breadcrumb: a scrollable ancestor tree with clickable source navigation, row previews, keyboard navigation, and independent styling.

## Plugin settings

Every plugin setting is searchable from Obsidian's Settings search. List static tree-guide rendering and all three mode preferences are enabled by default. Connecting separate list blocks is disabled by default. List Threading is globally disabled by default; Active List Item Threading, threading from an unmarked list head, Active Orphan List Threading, Active Orphan List Item Threading, and the three mode preferences are enabled so they take effect immediately if the global feature is enabled. Active Cursor List Threading, both all-branches options, and both blank-line list-block options are disabled by default.

| Setting | Purpose |
| --- | --- |
| List Static Tree Indentation Guides | Globally enables or disables the always-visible tree guides. Enabled by default. |
| Render in Live Preview | Shows guides in the editable Live Preview view. |
| Render in Source mode | Shows guides alongside raw Markdown list syntax. |
| Render in Reading mode | Shows guides in rendered Markdown. |
| Connect separate list blocks | Lets continuation/gutter spines bridge non-list content between editor list blocks. Disabled by default. |
| List Threading | Enables Logseq-style active-list highlighting. |
| Active Cursor List Threading | In Live Preview and Source mode, replaces hover activation with the focused editor caret for every enabled regular or orphan threading submode. Disabled by default; Reading mode remains hover-based. |
| Active List Item Threading | Highlights the complete ancestor path to the active list item. Enabled by default. |
| Thread separate list blocks that are only separated by a blank line (Active Item) | Lets an active-item path continue into an adjacent blank-line-separated list block. Disabled by default. |
| All Branches of an Active List Threading | Highlights every branch in the active item’s list block. Disabled by default. |
| Thread separate list blocks that are only separated by a blank line (All Branches) | Lets All Branches include adjacent blank-line-separated blocks. Disabled by default; nonblank content always separates threading blocks. |
| Unmarked List Head List Threading | Extends Active Item and All Branches threading from the immediately preceding unmarked line. Enabled by default. |
| Active Orphan List Threading | Enables threading for top-level ordered or unordered list blocks without an unmarked list head. Enabled by default. |
| Active Orphan List Item Threading | Highlights the path to the active item in an orphan list. Enabled by default. |
| All Branches of an Active Orphan List Threading | Highlights every branch in the active orphan list block. Disabled by default. |
| Thread in Live Preview | Allows hover- or caret-activated threading in Live Preview when the global feature is enabled. |
| Thread in Source mode | Allows hover- or caret-activated threading in Source mode when the global feature is enabled. |
| Thread in Reading mode | Allows hover-activated threading in Reading mode when the global feature is enabled. |

### List Hover Breadcrumb

The breadcrumb is enabled by default in Live Preview, Source, and Reading mode, including internal embeds. Hover from the left gutter through a list marker to open it. Enable **Full-Width List Item List Hover Breadcrumb Activation** to activate across the entire row. With both full-width options off, only the marker activates it. Unmarked heads can activate the full-row scope when **Unmarked List Head List Threading** is enabled. Right-to-left layouts use the corresponding right gutter.

The popover shows the item's ancestors and highlights the current item. Hover or focus another row to preview that field in the main view. Click a row to navigate permanently. In an embed, clicking an ancestor outside the visible excerpt opens its original note at the source line. Repeated labels use source positions to identify the correct item.

| Breadcrumb control | Default / behavior |
| --- | --- |
| List Hover Breadcrumb | On; disabling it makes subordinate controls inaccessible. |
| Full-Width List Item activation | Off. |
| Full-Width List Marker activation | On. |
| Live Preview, Source, Reading activation | All on, independently configurable. |
| Expand long list items | On; wraps complete labels. Off uses a single line with an ellipsis. |
| List Hover Breadcrumb List Markers | On, with separate marker typography and appearance controls. |
| List Hover Breadcrumb Static Tree Indentation Guides | On; all three modes on, connect-separate-blocks off. |
| List Hover Breadcrumb Threading | Off; independent per-mode controls, active-item and orphan modes, unmarked heads, and blank-line joining mirror the main settings. All-branches threading expands the displayed tree to include the selected block's branches. |
| Active Selected List Threading | Off; when enabled, the current/last clicked row determines popup threading instead of the hovered row. This adapts cursor threading to the popover. |
| Navigate before timeout | On; preview scrolling preserves the editor caret and restores the prior scroll position on cancellation. |
| Navigate after timeout | Off; enabling it retains or applies the last previewed row when the dismissal timer expires. Escape cancels deferred navigation. |
| Popover timeout | Global on at 0.01 seconds, with optional independent decimal overrides for each viewing mode. |

Arrow Up/Down, Home, and End move focus through breadcrumb rows. Enter activates a row; Escape closes the popover. The gap between the source row and the popover remains traversable while the pointer moves between them.

The breadcrumb's settings and Style Settings variables are independent of those used in the note. Child controls are disabled whenever their parent feature is disabled. List Threading in rendered embeds uses hover; an embed has no editable caret.

## Style Settings

Install and enable the community plugin **Style Settings** to customize:

- Guide color.
- Guide opacity.
- Guide thickness.
- Horizontal connector length.
- Gap before the list marker or content.
- First-branch vertical rise.
- Connector vertical offset.
- Solid, dashed, or dotted guide pattern.
- Dash and dot spacing.
- Visibility of unordered-list bullets in Live Preview and Reading mode (enabled by default).
- Active-item and all-branches thread opacity, thickness, line caps, and corner radius.
- Thread connector length, **Thread connector height**, marker gap, and vertical offset.
- Eight independently themed list-thread colors, each with an enabled-by-default toggle; deeper levels reuse the eighth color.
- An enabled-by-default global fallback for disabled list-thread colors and a disabled-by-default global override with independently persisted light- and dark-mode native color inputs.
- Breadcrumb appearance, dimensions, spacing, typography, current/hovered-row highlights, marker styling, static guides, and threading, including separate color enablement, fallback, and override controls.

**Thread connector height** defaults to **100% of the available vertical gap below the parent marker**. Marker clearance includes half the stroke width so round and square caps remain clear at the default offset. Lower percentages shorten the upper end of each elbow; they do not move the child's horizontal connector. Values above 100% extend the upper end upward. The slider reaches 500%; its precise value field accepts any nonnegative finite percentage, including larger values. Breadcrumb threading has its own height control.

Version 2.0.0 measures rendered markers and sibling positions directly. The old Reading-mode row-height, segment-overlap, and marker-position compensation controls are retired; they depended on fixed spacing and caused misalignment in embeds. Existing mode, threading, and color preferences retain their saved keys.

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
npx playwright install chromium
npm run test:browser
npm run build
git diff --exit-code -- main.js
```

The validation and release workflows run browser layout and interaction tests as well as type, lint, and unit checks. The release workflow confirms that committed `main.js` is current, creates the three standard Obsidian release assets, and publishes GitHub artifact attestations for each asset.

Browser tests use Chromium, real CodeMirror, and the plugin's actual modules with a minimal Obsidian host adapter. They are **not tests inside Obsidian desktop**. See [2.0.1 validation notes](docs/validation-2.0.1.md) for evidence, coverage, and remaining desktop checks.

## Acknowledgements

The list-threading interaction and rendered-list geometry are adapted from the MIT-licensed [obsidiest/obsidian-bullet](https://github.com/obsidiest/obsidian-bullet) fork.

The List Hover Breadcrumb interaction, settings, navigation behavior, and appearance controls are adapted from [Extended Headings 2.1.0](https://github.com/obsidiest/obsidian-extended-headings/tree/2.1.0), also MIT-licensed (copyright 2026 obsidiest). Heading-level-specific Outline, root/orphan-heading-gap, and mixed-heading-tree controls do not apply to list hierarchies; the list plugin's regular, orphan, and blank-line block modes are used instead.

## License

MIT
