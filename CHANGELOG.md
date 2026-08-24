# Changelog

All notable changes to this project are documented in this file.

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
