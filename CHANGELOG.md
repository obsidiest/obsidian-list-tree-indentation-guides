# Changelog

All notable changes to this project are documented in this file.

## 1.0.3 - 2026-08-24

- Stop guide groups and viewport-continuation spines at definite non-list boundaries so separate list blocks no longer appear connected by default.
- Add a searchable **Connect separate list blocks** setting, disabled by default, for users who intentionally want continuation/gutter spines to bridge those boundaries.
- Make editor bullet threading respond to the full vertical hit area of every visible list-item row instead of depending on which child DOM element receives the pointer event.
- Add **Active List Item Threading**, enabled by default, and **All Branches of an Active Bullet List Threading**, disabled by default.
- Apply existing Style Settings thread colors, opacity, thickness, caps, corner radius, connector geometry, and Reading-mode geometry to the new threading behavior.
- Preserve viewport-bounded rendering, mixed-list and pop-out support, searchable settings, synchronized precise Style Settings inputs, and attested release assets.

## 1.0.2 - 2026-08-24

- Replace the editor syntax-tree dependency with a viewport-bounded model of Obsidian's rendered `HyperMD-list-line-N` rows so guides reliably receive path data in Live Preview and Source mode.
- Mount each SVG in its editor pane and measure actual unordered, ordered, and task-list markers to keep spines and connectors visible and aligned across themes, zoom levels, and pop-out windows.
- Derive bullet-thread hover targets and ancestor paths from the same rendered rows, fixing inactive threading when the parser model was empty or delayed.
- Preserve precise sibling grouping, mode toggles, searchable settings, default-visible list markers, Style Settings controls, and attested release assets.
- Limit updates to rendered editor rows and animation-frame coalescing, without vault scans or the large selector expansion that previously caused startup and document-rendering regressions.

## 1.0.1 - 2026-08-24

- Fix editor guides not appearing by moving the SVG out of CodeMirror's managed DOM and clipping a viewport-fixed layer to each editor.
- Fix Reading-mode decoration and styling to target Obsidian's rendered Markdown container.
- Show unordered-list markers by default in Style Settings.
- Add optional Logseq-style bullet threading with a global toggle and independent Live Preview, Source, and Reading-mode toggles.
- Add Style Settings controls for thread colors, opacity, thickness, caps, corner radius, connector geometry, and Reading-mode geometry.
- Expand regression coverage for nested parent paths, release metadata, searchable settings, and Style Settings defaults.

## 1.0.0 - 2026-08-23

- Initial release.
- Render connected list-tree guides in Live Preview, Source mode, and Reading mode.
- Add independently searchable mode toggles.
- Add Style Settings visual controls with precise synchronized numeric inputs.
- Add deterministic validation, release assets, and GitHub artifact attestations.
