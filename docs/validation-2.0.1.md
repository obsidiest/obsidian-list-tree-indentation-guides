# 2.0.1 validation

This change is prepared for a draft PR. No Obsidian desktop session is available in this environment. Browser results below use real plugin modules and CodeMirror with a minimal Obsidian DOM/workspace adapter; they do not establish that the reported Windows/Minimal/Style Settings runtime behavior is resolved.

## Causes located before editing

The initial regression runner was executed against the 2.0.0 source at `0e8b79862f532dfefeb2887eeff0cdf843d0a2bc`. Seven of eight scenarios failed; the [initial result and console stack](evidence/2.0.0-regressions.json) are preserved. The unchanged legacy browser suite did not cover these lifecycle conditions.

| Report | Diagnosis / reproduction | Change |
| --- | --- | --- |
| Frozen breadcrumb; later breadcrumbs cannot open | Editing with an open popup invokes `dismiss()` from `ViewPlugin.update`. Its highlight cleanup dispatches another CodeMirror transaction during the current update. CodeMirror reports `Calls to EditorView.update are not allowed while an update is in progress` and drops the crashed view plugin. Popup state was nulled before DOM cleanup, stranding a nonfunctional dialog. | Remove the dialog and observers first. Skip editor dispatch from update/destroy callbacks; clear reconfiguration highlights after the transaction. Document edits already clear the highlight state field. |
| Popup does not time out after a rendered-row click | An additional reproduction found that ordinary mouse focus in Reading mode satisfied the unconditional focus guard forever. | Only keyboard focus protects against timeout. Pointer interaction restores normal dismissal. Detached embed targets also dispose their popup. |
| Embed guides disappear | Replacing host contents removes the SVG, but the old surface keeps drawing into that detached SVG. A postprocessed section mounted after the queued scan is never discovered without another layout event. Both conditions fail in browser reproductions. | Observe actual surface mounting/removal/replacement and reattach the overlay. Use a coherent DOM fallback during partial registration. |
| Outer-document scrolling becomes expensive | The old document scroll listener schedules every surface; each frame recollects the hierarchy, measures markers, and replaces SVG paths. Five unchanged scroll events caused five overlay rewrites. Source inspection also found whole-subtree cloning for every DOM-fallback parent. This establishes unnecessary work, not the precise timing or complete cause of the user's application freeze. | Cache content-relative measurements, invalidate affected surfaces on real layout/content changes, avoid global postprocessor invalidation, and prune nested subtrees while reading fallback labels. Five unchanged outer scrolls now cause zero overlay mutations in the fixture. |
| No threading in embeds | A widget that stops bubbling `pointermove` prevents the document's delegated hover listener from seeing the item. This condition reproduces missing paths. Actual Obsidian embed event propagation has not been observed here. | Use capture-phase pointer listeners for rendered threading and breadcrumbs. |
| Incorrect punctuation in breadcrumb labels | The controller put raw Markdown into `textContent`, exposing inline-code delimiters and escaped punctuation beside colons. The source-label fixture reproduced this. | Project the Markdown syntax tree into plain display text. Decode entity tokens through Obsidian's sanitizer; never insert source HTML. Already-rendered DOM fallback labels bypass Markdown parsing. |
| Breadcrumb Threading toggle ineffective | The standalone 2.0.0 fixture already draws visible threads with the toggle on and main threading off. Its exact independent failure was not reproduced. A controller that has crashed in the editor case above cannot open a working threaded breadcrumb. | Correct the shared controller lifecycle and add regressions that reopen threaded breadcrumbs after edits and exercise independent mode/orphan settings. No unsupported claim of a separate toggle defect. |
| Connector height cannot exceed 100% | Both metadata sliders, the precise-input range check, and the parent-start geometry imposed an upper limit. A 150% path was identical to 100%. | Remove the geometry ceiling; expose a 0–500% slider and an unbounded nonnegative finite precise field. Expand the native range and recover the saved CSS value on control reconstruction. |

## Automated checks

- Local checks passed: TypeScript, Obsidian ESLint rules, 56 unit tests, 31 browser scenarios (16 existing + 15 new), and the production build.
- The existing 16 browser scenarios remain in `tests/browser/run.mjs`.
- `tests/browser/regressions.mjs` adds editor edit/reconfigure/destroy cleanup; pointer timeout and keyboard focus; replaced/detached/late-mounted/partially replaced embeds; unchanged-scroll redraw counts; intercepted widget hover; source and literal DOM labels; independent breadcrumb threading gates; geometry beyond 100%; and precise-height reconstruction at 725.25%.
- The new runner captures both uncaught page errors and console errors. This matters because CodeMirror logs a crashed view plugin to the console instead of necessarily raising a page error.
- `npm run test:browser` runs both suites. The second suite writes `release/browser/regressions-2.0.1.json`; CI uploads it with the existing browser evidence. Local browser: Chromium 143.0.7499.0. CI uses the version supplied by Playwright 1.58.2.

The precision-control fixture verifies events and reconstruction from saved CSS values, not Style Settings' disk persistence. The embed fixtures are representative DOM structures, not Obsidian's live transclusion renderer. The 100% default still clears parent markers; deliberately larger percentages can extend upward over earlier content.

## Obsidian desktop checks still required

1. With Minimal and Style Settings, compare heading and block embeds in Live Preview and Reading mode. Scroll the outer note and the embed, switch tabs, fold/unfold, and edit the source note. Confirm guides remain present, threading activates on list rows, and scrolling stays responsive.
2. Open a breadcrumb, type in the source, change viewing mode, then reopen it. Exercise popup scrolling, mouse/keyboard navigation, Escape, outside clicks, and timeout after clicking a row. Repeat in a long note and a pop-out window; inspect the developer console for CodeMirror plugin crashes.
3. Enable Breadcrumb Threading while main threading is disabled. Check ordinary and orphan lists, active-item/all-branches/selected-row settings, and the per-mode gates. If it remains invisible, preserve the actual plugin and Style Settings settings with the reproduction; the isolated baseline did not reproduce an independent toggle failure.
4. Check labels containing colons, backticks, links, escaped punctuation, entities, and Unicode against their visible note text.
5. Set both height controls to 150% and to a precise value above 500%. Close/reopen Style Settings and restart Obsidian; verify each value and the visible reach. Return to 100% to check default marker clearance.

The PR is for review and these desktop checks. Building successfully is not runtime verification.
