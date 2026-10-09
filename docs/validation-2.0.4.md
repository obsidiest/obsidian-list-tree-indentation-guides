# 2.0.4 validation

## Cause located and reproduced before implementation

The supplied screenshots show editor identifiers `[^11]`, `[^2]`, `[^13]`, and `[^12]`, but breadcrumb ordinals `[10]`, `[11]`, `[12]`, and `[13]`.

On the unchanged 2.0.3 production code at `76e9a9f`, `footnoteContext()` assigned an independent number to each named reference in document order. `BreadcrumbContent.render()` then replaced the isolated renderer's numbers with that map for every view. This made an editor's authored identifier look like a different footnote, and lost repeat-reference suffixes when repeats occurred in separate breadcrumb rows.

Before editing production code, the six cases in `tests/browser/breadcrumb-footnotes.mjs` were run against that baseline, using the official Obsidian 1.14.4 parser/HTML transforms in Chromium. All six failed. Both editor fixtures produced exactly `[10], [11], [12], [13]` instead of the screenshot's source identifiers. A rendered parent/child repeat fixture produced `[1], [1], [2]` instead of the originating labels `[8], [8-1], [9]`.

The rendered repeat fixtures deliberately supply host labels that differ from source-order counting: the originating DOM must be authoritative. They are browser fixtures, not observations from a desktop vault.

## Replacement approach

- Remove the manual numbering map entirely. Retain document-scoped definitions solely to let Obsidian render valid superscript links in each isolated item.
- Editor breadcrumbs use each named reference's original identifier, spelling, and occurrence. The parser excludes code, escaped references, math, wikilinks, and inline-note contents from these named-label queues.
- For rendered notes and embeds, copy displayed label text from the originating item's own superscript links. Exclude descendant lists and embedded content, match named references by identifier and occurrence, and match inline notes by occurrence independently of the renderer's temporary inline IDs.
- Keep named links targeted at the originating file's definition. If a rendered ancestor's original label is unavailable, retain the source identifier instead of inventing an ordinal.

## Paragraph Spacing

The requested setting is in **List Hover Breadcrumb → Breadcrumb Geometry and Typography**. Its slider and synchronized precise input accept 0–4 em, with a custom default of 1 em. **Custom paragraph spacing** is off by default so upgrading preserves automatic editor/Reading-mode spacing.

The source-derived spacing now has a separate CSS variable. Enabling the custom setting changes the gap without being shadowed by the popup's inline source measurement. Disabling it restores automatic spacing. First/last paragraph outer margins remain zero, and existing row-resize observation updates guide geometry.

## Automated checks

Completed locally:

| Check | Result |
| --- | --- |
| Unit tests | 67 passed |
| Full Chromium/CodeMirror browser suite | 127 scenarios passed |
| Focused Obsidian 1.14.4 parser runs | 27 scenarios passed across footnotes, structure, and layout |
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

Focused browser coverage includes the supplied nonsequential identifiers in Live Preview/Source fixtures; mixed-case, leading-zero, and repeated identifiers; rendered-note and embed labels; named-link destinations; inline labels in rendered content; and custom spacing of 0, 1.375, and 4 em in all three modes. Spacing checks measure paragraph gaps and outer margins, verify child guides clear the parent, and restore automatic spacing. The precise-input test checks a value between slider ticks.

The optional host-parser runs are:

```sh
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-footnotes.mjs
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-structure.mjs
LTIG_OBSIDIAN_ASSETS=/path/to/extracted/obsidian-1.14.4 node tests/browser/breadcrumb-layout.mjs
```

The official 1.14.4 gzip archive was checked against the release metadata's SHA-256 value `0e1CjDY5aHdPDzkG5n2KU6BY7OC2zdkksHhll3sq2iE=`. The existing `host-markdown.mjs` helper runs its parser and HTML transformation functions unchanged, omitting desktop startup. No proprietary application assets are committed.

## Obsidian desktop checks still required

No behavior in this change has been verified inside Obsidian desktop. A passing build, unit test, or Chromium fixture is not desktop verification. The parser integration omits the application lifecycle, actual editor decorations, Markdown postprocessors, themes, and other plugins. The numeric-control fixture exercises the plugin's enhancement of a representative Style Settings row; it does not open the actual Style Settings UI.

Use [the focused fixture](../tests/fixtures/breadcrumb-footnotes.md) and the user's original note in Obsidian 1.14.4:

1. In Live Preview and Source, compare the named superscripts with the source identifiers, particularly `11, 2, 13, 12`, repeats, mixed case, and leading zeroes. Click a named footnote and confirm navigation reaches its definition in the originating file.
2. In Reading mode and rendered embeds/callouts, compare each breadcrumb label with the original rendered superscript, including repeats split across parent/child items and inline notes beside named notes.
3. Edit identifiers and definitions, dismiss/reopen the breadcrumb, and repeat with a scrolled or partially rendered ancestor.
4. Open the actual Style Settings subsection. Verify the new slider and precise field persist, including `1.375`. Enable custom spacing and compare gaps at zero and larger values; disable it and check that automatic note spacing returns.
5. With long multi-paragraph ancestors, watch static guides while changing spacing, resizing, and scrolling. Repeat with the user's theme, zoom, and other plugins.

Version metadata is 2.0.4; the minimum app version remains 1.13.0 because this change adds no newer API dependency. This change is prepared for draft-PR review; desktop acceptance, merge, and release are separate steps.
