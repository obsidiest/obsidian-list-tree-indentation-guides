# Changelog

All notable changes to this project are documented in this file.

## 1.0.5 - 2026-08-25

- Fix threading from a non-bulleted/numbered list head for ordered lists by anchoring editor paths to the rendered numeral instead of the wider ordered-marker layout box.
- Fix the occasional far-right guide overdraw in long, scrolled list blocks by ending every inferred off-screen ancestor spine at the first visible outdent for that depth.
- Replace the unreliable themed global-override color control with independent persistent light- and dark-mode Style Settings color controls.
- Rename **All Branches of an Active Bullet List Threading** to **All Branches of an Active List Threading**, while retaining the former wording as a searchable alias.
- Add regression coverage for ordered-marker anchors, depth-specific continuation bounds, setting metadata, synchronized versions, and the attested release workflow.

## 1.0.4 - 2026-08-25

- Split static guides at both content and blank-line list-block boundaries by default, and bound viewport continuation spines to their own visible block.
- Add **Treat separate list blocks that are separated only by a blank line**, disabled by default, as an all-branches-only opt-in; nonblank content remains a hard threading boundary.
- Add **Bullet threading from a non-bulleted/numbered list head**, enabled by default, for Active List Item and All Branches threading in editor and Reading modes.
- Add the global **Enable static list tree indentation guides** toggle above the three mode toggles under the new **Static List Tree Indentation Guides** section.
- Hide stale overlay geometry immediately during scrolling and clamp inferred ancestor spines to the current editor and list block.
- Add enabled-by-default Style Settings toggles for all eight bullet-thread colors, plus enabled-by-default themed fallback colors and disabled-by-default themed override colors.
- Rename **Guide appearance** to **Static List Tree Indentation Guide Appearance** and retain synchronized precise numeric fields for every numerical Style Settings control.
- Preserve searchable settings, mixed ordered/unordered lists, pop-out windows, viewport-only processing, release asset validation, and GitHub attestations.

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
