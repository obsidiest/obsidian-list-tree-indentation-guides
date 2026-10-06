# 2.0.3 validation

This update targets the reported 2.0.2 failures and Obsidian 1.14.4. **Obsidian desktop was not available for runtime verification.** Browser fixtures and the optional host-parser check below do not establish that the original symptoms are resolved in the user's vault.

## Follow-up after the user's test of `6d4d736`

The user reported that paragraph spacing was still incorrect and that static breadcrumb guides sometimes extended into long parent text. These reports supersede any inference of desktop correctness from the first candidate's passing tests. The new screenshots were inspected before editing.

**Spacing:** the previous test activated an editor breadcrumb but compared it with a hand-styled Reading-mode paragraph fragment. It did not compare the actual empty editor line with the popup, or exercise spacing scoped to the originating note. Removing the zero-margin override was insufficient: Live Preview and Source have authored empty editor lines even when the theme's Reading-mode `--p-spacing` is zero. A popup mounted under `document.body` also loses a note-local override of that variable.

The follow-up reproduces a 48 px empty editor line at a 24 px font versus a 0 px breadcrumb paragraph gap in both editor modes. A Reading note with a locally scoped 36 px paragraph margin also produced a 0 px popup gap. Minimal exposes its paragraph-spacing setting specifically for Reading mode; the inspected upstream reference is [theme commit `1394a35`](https://github.com/kepano/obsidian-minimal/blob/1394a35f84db3b52e6cf59c435d7c7862242837b/theme.css). Obsidian 1.14.4's renderer with default Minimal styling did produce a normal paragraph gap in an isolated browser probe. **The user's exact theme settings/source note were not available, so these reproduced mechanisms are not a claim that their paragraph-spacing setting is zero.**

The replacement approach measures an empty editor line (or the editor line height when no empty line is visible) and expresses that spacing relative to the breadcrumb's font. Reading-mode breadcrumbs inherit `--p-spacing` from the originating element, including an intentional zero. A dedicated paragraph rule applies that value instead of relying on the popup's body-level styling. The old paragraph-margin test now opens from Reading mode; separate tests compare editor blank-line spacing.

**Guide overdraw:** the observer previously watched only the total content size. In a reproduction, a late renderer expanded a wrapped parent's text by 210.56 px while another row shrank by the same amount. Total content height stayed 719.73 px, so no redraw occurred; the first guide still started 210.56 px above the new parent-text bottom. This failed in both LTR and RTL. The follow-up observes each row and label, positions the popup before measuring, and starts static branches below the full padded parent row.

[Pre-edit evidence for `6d4d736`](evidence/6d4d736-breadcrumb-layout.json) records five failures plus a passing zero-margin Reading control. `tests/browser/breadcrumb-layout.mjs` runs these six checks with a paragraph-only renderer adapter, or optionally with Obsidian 1.14.4's actual parser. The late-layout change is simulated; it does not identify which host/theme/postprocessor event caused the user's screenshot.

## Causes located before editing

The supplied screenshots and recording were inspected. The unchanged 2.0.2 source at `1c335fa00390666e58cc8ee86c514411eb3917c1` reproduced ten failing assertions across the four reported mechanisms. [Baseline evidence](evidence/2.0.2-breadcrumb-structure.json) records those failures and two passing full-item activation controls.

| Reported symptom | Located cause and baseline evidence | Change in 2.0.3 |
| --- | --- | --- |
| Paragraphs run together in breadcrumbs | The plugin's breadcrumb CSS set every paragraph's block margins to zero. The same three-paragraph markup measured a 24 px gap in the note and 0 px in the breadcrumb. | Remove that override. Retain only the outer first/last block margin resets. |
| Footnote superscripts become plain identifiers | Each item was rendered without definitions elsewhere in its source note. Obsidian 1.14.4's actual parser/HTML transformations reduced an undefined reference to its identifier. All three mode fixtures failed to produce a superscript. | Retain document-scoped definitions and reference order, supply them to the isolated render, remove the appended definition section, and restore the original numbering. Footnote clicks navigate to the originating note. Unresolved references remain literal superscripts without invented links or definitions. |
| Long continuation paragraphs activate with full-item scope off | The source model correctly associated a continuation line with its parent item, but hit testing measured a marker on that continuation row. Its text-range fallback treated paragraph text as a marker. Four Live Preview/Source combinations reproduced this with marker scope on and off. | Locate the marker on the item's opening source line. If that marker line is outside the rendered viewport, a continuation row cannot become a marker hit target. Full-item activation retains continuation coverage. |
| Guides and threads miss bullets preceding nested callouts | Native-marker fallback descended into callout body text when the title contained only an SVG icon. Its padding and vertical offset were incorrectly treated as the list marker's location. Left-to-right and right-to-left cases failed. | Use the leading callout title's first line for vertical alignment and the owning list item's edge for horizontal alignment. Ordinary items and later callouts retain their existing marker path. |

The continuation fixture now places indentation in a separate CodeMirror token. The earlier fixture put indentation and text in one text node, hiding the erroneous text-as-marker fallback. The callout regression also checks the actual painted native bullet: it colors the marker, reads its screenshot pixels, and compares connector endpoints with those pixels independently of the plugin's geometry estimate.

## Automated checks

- The follow-up passes 64 unit tests and 117 browser scenarios, plus TypeScript, ESLint, and the production build. The optional parser run passes the twelve structure cases and all six new layout cases; [the layout result](evidence/2.0.3-breadcrumb-layout.json) records the latter. The guide checks assert visible strokes and compare screen-space paths with the expanded parent text before and after scrolling.
- The first candidate passed 64 unit tests, 111 browser scenarios, TypeScript, ESLint, and the production build. Its optional 1.14.4 run passed all twelve scenarios (three use the host parser); [that result record](evidence/2.0.3-host-parser.json) is retained alongside the baseline failures. Those checks missed the follow-up cases described above.
- Unit tests cover external/multiline definitions, numbering, unresolved references, HTML escaping, and exclusions for code, escapes, math, YAML, and wiki links.
- `tests/browser/breadcrumb-structure.mjs` adds twelve scenarios: four restricted-scope cases, two full-item controls, paragraph gap comparison, two native-callout marker cases, and footnotes in Live Preview, Source, and Reading mode.
- The normal browser suite uses Chromium, real CodeMirror, plugin modules, and representative Obsidian DOM/rendering adapters. The three footnote scenarios can additionally run with the actual Obsidian 1.14.4 parser and HTML transformations.
- TypeScript, ESLint, unit tests, all browser suites, and the production build were run separately. A successful build is not treated as runtime verification.

Run the normal checks:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run test:browser
npm run build
```

`LTIG_CHROMIUM_PATH` can select an existing Chromium executable. Browser evidence and callout screenshots are written under `release/browser/`; CI uploads that directory.

### Optional Obsidian 1.14.4 parser check

The checked application archive was the official `obsidian-1.14.4.asar`, with SHA-256 (base64) `0e1CjDY5aHdPDzkG5n2KU6BY7OC2zdkksHhll3sq2iE=`, verified against Obsidian's desktop release metadata. No application assets are committed to this repository.

Extract the archive locally, then point the test at the directory containing `index.html`, `app.js`, and the scripts referenced by that HTML:

```bash
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 \
node tests/browser/breadcrumb-structure.mjs

LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 \
node tests/browser/breadcrumb-layout.mjs
```

`tests/browser/host-markdown.mjs` omits the desktop startup expression and exposes the original parser/HTML transformation functions. These functions run unchanged. The helper deliberately expects the 1.14.4 bundle boundary; it must be reviewed for another host version. This check does **not** run the desktop application, its CodeMirror decorations, Markdown postprocessors, MathJax, themes, vault lifecycle, or plugin interaction stack. The layout and hover cases still use browser fixtures in this optional run.

## Checks still needed inside Obsidian 1.14.4

Use [the focused note fixture](../tests/fixtures/breadcrumb-structure.md) and the user's original failing notes in a test vault.

1. Compare paragraph gaps and footnote superscripts between a breadcrumb and the rendered note. Check reference number two, a multiline definition outside the list, repeated references, and navigation to the source definition. Repeat in Live Preview, Source, Reading mode, and an internal embed.
2. With full-item activation off, move across long continuation paragraphs with full-marker activation on and then off. Neither setting combination should activate over paragraph text. The actual marker should still activate. Enable full-item activation and confirm continuation paragraphs activate again. Repeat with the item's opening line scrolled outside the viewport.
3. In the outer callout, compare static guides and active threads at the ordinary bullet, icon-only subordinate callout, and named subordinate callout. Check that a later callout does not move an ordinary item's marker. Repeat in rendered Live Preview callouts, Reading mode, embeds, and right-to-left layout.
4. Repeat with the user's theme, zoom, and other enabled plugins. Verify popup dismissal/reopening and footnote link behavior after note edits.
5. Compare multi-paragraph spacing in Live Preview/Source with the authored empty line, including when Reading-mode paragraph spacing is zero. Separately compare Reading-mode breadcrumbs with the note's paragraph-margin setting, including note-local overrides.
6. Use the long unmarked head and parent paragraphs near the end of the fixture. Watch the first static branch during opening, scrolling, viewport resizing, and late math/image rendering. It must remain below the entire parent row. Retest the user's original guide-overdraw example directly.

The version metadata is 2.0.3. The minimum supported version remains 1.13.0 because no newer API was introduced. This work is a draft PR for review; desktop acceptance, merge, and release are separate steps.
