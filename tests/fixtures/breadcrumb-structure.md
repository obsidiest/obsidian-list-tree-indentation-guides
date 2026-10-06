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
