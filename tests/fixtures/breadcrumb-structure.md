# Breadcrumb paragraphs, footnotes, and callouts

This earlier footnote sets the list item's reference number to two.[^first]

- First paragraph with a footnote.[^second]

  This is a deliberately long continuation paragraph. Move the pointer across its first visual line and its wrapped lines while Full-Width List Item List Hover Breadcrumb Activation is disabled. Try Full-Width List Marker List Hover Breadcrumb Activation on, then off. Text in this paragraph must not open a breadcrumb in either case. Turn full-item activation on and repeat: the continuation paragraph must now open the breadcrumb. Repeat in Live Preview and Source mode.

  Third paragraph. Open the breadcrumb over the child below and compare these three paragraphs with the rendered note. Their spacing and the footnote superscript should match.
  - Child used to open the ancestor breadcrumb.

> [!note] Outer callout
> - Ordinary bullet for comparison.
> - > [!quote] &#8203;
>   > A subordinate callout with an icon-only title.
>   >
>   > Another paragraph inside the subordinate callout.
> - > [!quote] Named title
>   > A subordinate callout with a text title.
> - An ordinary opening paragraph.
>
>   > [!quote] A later callout
>   > This callout must not move the marker from the opening paragraph.

[^first]: First definition, outside the list.
[^second]: Second definition, outside the list.

    This continuation paragraph belongs to the second definition.

## Long breadcrumb rows

This unmarked head deliberately contains enough text to wrap onto several lines in a narrow breadcrumb. Its first static branch should begin below the whole head, including the last wrapped line, as the popup opens and the viewport changes width.
1. This parent paragraph also wraps across several lines. The next static branch must start below this entire parent row. Compare the layout with a narrower window and with delayed rich content in the original failing note. Scrolling the breadcrumb must preserve the relationship between the branch and the text above it.
   1. The first paragraph of this child is separate from the next paragraph. Use a zero Reading-mode paragraph-spacing setting while testing in Live Preview or Source: the authored empty line below still needs space in the breadcrumb.

      This is the second paragraph. Reading mode should follow its own paragraph-spacing setting; an explicit zero there should remain zero.
