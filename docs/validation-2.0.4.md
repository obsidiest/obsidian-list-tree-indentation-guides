# 2.0.4 validation

## Cause located and reproduced before implementation

The supplied screenshots show editor identifiers `[^11]`, `[^2]`, `[^13]`, and `[^12]`, but breadcrumb ordinals `[10]`, `[11]`, `[12]`, and `[13]`.

On the unchanged 2.0.3 production code at `76e9a9f`, `footnoteContext()` assigned an independent number to each named reference in document order. `BreadcrumbContent.render()` then replaced the isolated renderer's numbers with that map for every view. This made an editor's authored identifier look like a different footnote, and lost repeat-reference suffixes when repeats occurred in separate breadcrumb rows.

Before editing production code, the six cases in `tests/browser/breadcrumb-footnotes.mjs` were run against that baseline, using the official Obsidian 1.14.4 parser/HTML transforms in Chromium. All six failed. Both editor fixtures produced exactly `[10], [11], [12], [13]` instead of the screenshot's source identifiers. A rendered parent/child repeat fixture produced `[1], [1], [2]` instead of the originating labels `[8], [8-1], [9]`.

The rendered repeat fixtures deliberately supply host labels that differ from source-order counting: the originating DOM must be authoritative. They are browser fixtures, not observations from a desktop vault.

## Follow-up on `d8d4359`: delayed labels and unresponsive spacing

### Evidence before the follow-up edits

The supplied 2.12-second recording shows the math row `test $\approx$ test[^13]` briefly displaying `[1]` and an appended footnote-definition section, then switching to `[^13]` and removing that section. Other ancestor labels are already correct.

The production code at `d8d4359` waited for `MarkdownRenderer.render()` to finish before correcting labels or removing definitions. Obsidian 1.14.4's renderer appends HTML before awaiting asynchronous postprocessors. A math postprocessor can therefore leave the renderer's temporary labels visible during that wait. Six browser cases held the renderer promise unresolved, with synchronous or delayed HTML insertion in each of Live Preview, Source, and Reading fixtures. All six failed on the unchanged baseline; the math row displayed `[1]` while the other rows had their expected labels.

The exact cause of the spacing failure in the user's vault has **not** been confirmed. Plain paragraphs responded correctly on the baseline in a browser probe using Obsidian 1.14.4's isolated renderer/CSS, Minimal 9.1.4 CSS, and the released Style Settings 1.0.9 manager. The manager generated the expected CSS values, so the evidence does not establish a persistence defect.

A narrower layout defect was reproduced before editing paragraph production code: the old rule only set margins on direct `<p>` children. Three fixtures—individual paragraph wrappers, a shared wrapper, and an inline paragraph-margin reset—each retained a zero gap at `1.375em` instead of the expected `17.875px` at a 13px font. These fixtures establish weaknesses in the old margin-based implementation; they are not observations of the user's exact DOM or plugin configuration.

### Follow-up replacement

- Normalize footnote labels and remove appended definitions immediately after renderer invocation. Install a mutation observer before invoking the renderer so asynchronous insertions and replacements are normalized before the next paint, independently of the render promise. Keep occurrence matching repeatable and disconnect the observer with the popup's render scope.
- Identify paragraph-only containers, including neutral wrapper chains, and use CSS grid `row-gap` to own the space between their paragraph blocks. Preserve renderer nodes and widget ownership; leave inline text, embeds, callouts, and other semantic blocks outside this grouping. Re-evaluate groups after asynchronous DOM changes. Keep the existing margin fallback for mixed block content.
- Indent the **Paragraph Spacing** value row beneath **Custom paragraph spacing** and show it only while the toggle is enabled. Preserve the existing setting IDs and saved values.

## Original replacement approach

- Remove the manual numbering map entirely. Retain document-scoped definitions solely to let Obsidian render valid superscript links in each isolated item.
- Editor breadcrumbs use each named reference's original identifier, spelling, and occurrence. The parser excludes code, escaped references, math, wikilinks, and inline-note contents from these named-label queues.
- For rendered notes and embeds, copy displayed label text from the originating item's own superscript links. Exclude descendant lists and embedded content, match named references by identifier and occurrence, and match inline notes by occurrence independently of the renderer's temporary inline IDs.
- Keep named links targeted at the originating file's definition. If a rendered ancestor's original label is unavailable, retain the source identifier instead of inventing an ordinal.

## Paragraph Spacing

The requested setting is in **List Hover Breadcrumb → Breadcrumb Geometry and Typography**. Its slider and synchronized precise input accept 0–4 em, with a custom default of 1 em. **Custom paragraph spacing** is off by default so upgrading preserves automatic editor/Reading-mode spacing.

The value row appears indented below its parent toggle when enabled. The source-derived spacing has a separate CSS variable. Enabling the custom setting changes the gap without being shadowed by the popup's inline source measurement. Disabling it restores automatic spacing. First/last paragraph outer margins remain zero, and existing row-resize observation updates guide geometry.

## Automated checks

Completed locally:

| Check | Result |
| --- | --- |
| Unit tests | 67 passed |
| Full Chromium/CodeMirror browser suite | 136 scenarios passed |
| Focused Obsidian 1.14.4 parser runs | 36 scenarios passed across footnotes, structure, and layout |
| Style Settings 1.0.9 + Obsidian 1.14.4 renderer/CSS + Minimal 9.1.4 CSS | 12 scenarios passed |
| TypeScript, ESLint, production build, whitespace check | Passed |

The local browser was Chromium 153.0.8010.0. These results are automated fixture evidence; none establish desktop acceptance.

The local validation commands are:

```sh
npm test
npx tsc --noEmit
npm run lint
npm run build
LTIG_CHROMIUM_PATH=/path/to/chromium npm run test:browser
```

Focused browser coverage includes the supplied nonsequential identifiers in Live Preview/Source fixtures; mixed-case, leading-zero, and repeated identifiers; rendered-note and embed labels; named-link destinations; inline labels in rendered content; and custom spacing of 0, 1.375, and 4 em in all three modes. Spacing checks measure paragraph gaps and outer margins, verify child guides clear the parent, and restore automatic spacing. The precise-input test checks a value between slider ticks and the dependent row's visibility. The delayed-render cases inspect three painted frames while the render promise remains unresolved, including the absence of appended definitions. Wrapper/reset spacing cases measure the actual paragraph gap.

The separate upstream-spacing integration runs the unchanged Style Settings manager and Obsidian isolated renderer with real Obsidian and Minimal CSS. In each mode it checks plain paragraphs plus the three deliberately simulated postprocessor shapes at 0, 1.375, and 4 em; generated CSS; localStorage persistence and manager reload; and restoration of automatic spacing. It does not interact with the actual settings UI or save to an Obsidian vault.

The optional host-parser runs are:

```sh
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-footnotes.mjs
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-structure.mjs
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-layout.mjs
```

The optional spacing integration command is:

```sh
LTIG_STYLE_SETTINGS_SOURCE=/path/to/obsidian-style-settings \
LTIG_CHROMA_JS=/path/to/chroma-js/chroma.js \
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 \
LTIG_MINIMAL_CSS=/path/to/obsidian-minimal/theme.css \
LTIG_CHROMIUM_PATH=/path/to/chromium \
node tests/browser/upstream-spacing.mjs
```

This run used Style Settings commit `4ebec6ae0131a9d5e8307bb5e26d59db5ba2e81c` (1.0.9), chroma-js 2.4.2, and Minimal commit `93321bdc23fc879966e1e3aa0cfeda77012f540f` (9.1.4). The manager's storage/events and unused import/export dialogs are adapted; its settings and CSS-generation logic are unchanged. The helper also exposes Obsidian's isolated renderer for this test, with desktop startup omitted.

The official 1.14.4 gzip archive was checked against the release metadata's SHA-256 value `0e1CjDY5aHdPDzkG5n2KU6BY7OC2zdkksHhll3sq2iE=`. The existing `host-markdown.mjs` helper runs its parser and HTML transformation functions unchanged, omitting desktop startup. No proprietary application assets are committed.

## Obsidian desktop checks still required

No behavior in this change has been verified inside Obsidian desktop. A passing build, unit test, or Chromium fixture is not desktop verification. The parser-only runs omit the application lifecycle, actual editor decorations, Markdown postprocessors, themes, and other plugins. The separate spacing integration includes isolated rendering and host/theme CSS, but still omits desktop lifecycle, the actual settings UI, and the user's other plugins. The numeric-control fixture exercises the plugin's enhancement of a representative Style Settings row; it does not open the actual Style Settings UI.

Use [the focused fixture](../tests/fixtures/breadcrumb-footnotes.md) and the user's original note in Obsidian 1.14.4:

1. In Live Preview and Source, compare the named superscripts with the source identifiers, particularly `11, 2, 13, 12`, repeats, mixed case, and leading zeroes. Click a named footnote and confirm navigation reaches its definition in the originating file.
2. In Reading mode and rendered embeds/callouts, compare each breadcrumb label with the original rendered superscript, including repeats split across parent/child items and inline notes beside named notes.
3. Reopen the breadcrumb containing `test $\approx$ test[^13]` repeatedly, including after restarting Obsidian so math is not already warm. Check the first visible frame for the correct label and absence of appended definitions. Edit identifiers and definitions, dismiss/reopen the breadcrumb, and repeat with a scrolled or partially rendered ancestor.
4. Open the actual Style Settings subsection. Verify the slider and precise field appear below their enabled parent toggle, persist (including `1.375`), and disappear when it is disabled. Enable custom spacing and compare gaps at zero and larger values; disable it and check that automatic note spacing returns.
5. With long multi-paragraph ancestors, watch static guides while changing spacing, resizing, and scrolling. Repeat with the user's theme, zoom, and other plugins.

Version metadata is 2.0.4; the minimum app version remains 1.13.0 because this change adds no newer API dependency. This change is prepared for draft-PR review; desktop acceptance, merge, and release are separate steps.
