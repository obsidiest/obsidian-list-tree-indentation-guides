# Rich breadcrumb content

This is a manual Obsidian fixture. Hover the deepest marker in each group and compare the breadcrumb with the note in Live Preview, Source, Reading mode, and an embed of this heading.

- **Math:** $\approx$ and $x^2 + y^2 = z^2$.
  - <svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" viewBox="0 0 32 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 2 H14 L16 4 L18 2 H30 V20 H18 L16 22 L14 20 H2 Z M16 4 V22"/></svg> Book icon.
    - [[rich-breadcrumbs#Rich breadcrumb content|An internal link]], [an external link](https://obsidian.md), *italic*, **bold**, `code:`, colon: and ampersand &.
      - Hover this item. ^rich-breadcrumb-leaf

- Display math:

  $$
  \sum_{k=1}^{n} k = \frac{n(n+1)}{2}
  $$

  - A child of a multiline item.
    - Hover this item.

- <svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 40 24">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor"/>
    <path d="M24 3 L38 12 L24 21 Z" fill="currentColor"/>
  </svg>

  - A child of a multiline SVG item.

- [ ] A task with **formatting** and $\alpha$.
  - Child text must appear only in its own breadcrumb row.

Embed examples (put these in a separate note to avoid self-embedding):

```markdown
![[rich-breadcrumbs#Rich breadcrumb content]]
![[rich-breadcrumbs#^rich-breadcrumb-leaf]]
```
