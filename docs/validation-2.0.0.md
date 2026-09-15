# 2.0.0 validation

## Causes located before changes

- **Embed misalignment:** the 1.1.0 Reading renderer inserted branch spans and styled guides/threading with fixed item heights, overlap, and marker offsets. The same rules applied to internal embeds despite their different margins and line metrics. Source inspection matched the offsets shown in the user's screenshots. 2.0.0 replaces those assumptions with measured marker positions and a separate SVG for each rendered surface.
- **Parent-marker occlusion:** active-item and all-branches editor paths started at the parent's marker center. A thick vertical stroke therefore ran through the marker. Paths now start below the marker's lower edge plus the configured gap and half the stroke width. `Thread connector height` controls the remaining reach as a percentage.
- During browser testing, a fractional-height fixture exposed drift caused by using rounded `offsetHeight` as a scale reference. The renderer now uses the fractional computed border-box dimensions.

These are source-level diagnoses and automated browser reproductions. No Obsidian desktop session was available for this work.

## Automated checks

- TypeScript and the Obsidian ESLint rules.
- Unit coverage for list parsing, ordered/unordered/task items, unmarked heads, repeated labels, code/frontmatter exclusion, blank-line separation, threading plans, settings migration, parent gating, timeout precedence, guide geometry, and stroke-cap clearance.
- Browser tests bundle the actual renderer, breadcrumb controllers, and CodeMirror extensions. A small adapter provides Obsidian's DOM helpers and workspace navigation interface; it does not emulate the Obsidian application.
- Browser scenarios cover tight/loose spacing, heading-style and partial block embeds, nested surface isolation, all three viewing-mode gates, root/child marker clearance, height adjustment, activation scopes, exact markers, unmarked heads, ancestor navigation by source line, all-branches expansion, independent guide/thread colors, keyboard activation, CodeMirror caret threading, decimal inputs, color-event persistence through control reconstruction, wrapping, timers, preview-scroll restoration, blank-line join controls, and lifecycle cleanup.
- Local layout evidence was produced with Chromium 143.0.7499.0. CI uses the Chromium version pinned by Playwright 1.58.2. `npm run test:browser` writes screenshots and a result manifest to `release/browser/`; validation CI uploads that directory.

The settings persistence fixture verifies forwarding to the Style Settings text control and rebuilding controls from saved values. It does not exercise Style Settings' own disk I/O or a native OS color-picker window.

## Reference adaptation

Reference: Extended Headings tag `2.1.0`, commit `29fa258db770311a72ab42eaf2e8cb9a4852fbb7`.

| Reference feature | List adaptation |
| --- | --- |
| Global/pane/mode activation and full field/marker scopes | Global list feature and three viewing modes; list marker and complete-row scopes. Obsidian's heading Outline is not a list surface. |
| Hierarchy popover and keyboard navigation | Source-indexed list ancestors, ordered/unordered/task markers, unmarked heads, current and focused rows. |
| Wrapping, preview before/after timeout, decimal global/per-mode timeout | Preserved with list-specific setting names and descriptions. |
| Selected heading threading | Selected breadcrumb-row threading; main Active Cursor List Threading remains unchanged. |
| Regular/root/orphan/mixed heading submodes | Regular and orphan list submodes, unmarked list heads, active/all-branches paths, and blank-line joining from this plugin. Heading-level gaps and Outline-specific modes have no list equivalent. |
| Marker, guide, thread, popup, and highlight appearance | Independent `ltig-breadcrumb-*` controls. Numeric values receive synchronized precise text fields. Main and breadcrumb thread height controls share the same safe-gap semantics. |

## Obsidian desktop acceptance still required

1. In a test vault, compare the same mixed ordered/unordered/task tree outside embeds, inside `![[Note#Heading]]`, and inside `![[Note#^block-id]]`. Try embeds in Live Preview and Reading mode, including nested embeds, wrapped items, folded sections, and the user's theme.
2. Hover the gutter, markers, text, and unmarked heads in each viewing mode. Check each activation and feature toggle, including parent-disabled controls, orphan lists, and both blank-line join settings.
3. Open a partial embed's breadcrumb and click an ancestor outside the excerpt. Confirm the correct source note and line open, especially when labels repeat. Preview a long ancestor, then cancel with Escape and confirm the scroll position and caret are retained.
4. Compare main and breadcrumb static guides/threading with independent styles. Try `Thread connector height` at 100%, 50%, and 0%, different stroke weights, and ordered parent markers. Confirm default geometry leaves markers clear in the actual theme.
5. Change light/dark fallback and override colors independently; close/reopen Style Settings and restart Obsidian. Check native color input behavior on the target operating system.
6. Exercise a long list while scrolling, a pop-out window, mode switching, note switching, and plugin disable/re-enable. Confirm there are no stale popovers, duplicate guides, or console errors.

Do not treat a successful build or these browser fixtures as completion of the desktop acceptance steps above.
