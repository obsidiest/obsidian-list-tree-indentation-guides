/** Visible control/glyph bounds, independent of an inline marker's line box. */
export function visibleListMarkerRect(marker: HTMLElement, scaleHost: HTMLElement): DOMRect | null {
  const win = marker.ownerDocument.defaultView;
  const measured = marker.getBoundingClientRect();
  if (!win || measured.height <= 0 || win.getComputedStyle(marker).visibility === "hidden") return null;
  if (marker.classList.contains("list-bullet")) {
    const glyph = win.getComputedStyle(marker, "::after");
    const width = Number.parseFloat(glyph.width), height = Number.parseFloat(glyph.height);
    if (glyph.content !== "none" && width > 0 && height > 0) {
      const scale = elementScale(scaleHost);
      const w = width * scale.x, h = height * scale.y;
      return new DOMRect(measured.left + (measured.width - w) / 2,
        measured.top + (measured.height - h) / 2, w, h);
    }
  }
  return measured.width > 0 ? measured : null;
}

/** Fractional CSS dimensions preserve alignment inside zoomed/scaled embeds. */
export function elementScale(element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const px = (key: string) => Number.parseFloat(style.getPropertyValue(key)) || 0;
  const borderBox = style.boxSizing === "border-box";
  const width = px("width") + (borderBox ? 0 : px("padding-left") + px("padding-right") + px("border-left-width") + px("border-right-width"));
  const height = px("height") + (borderBox ? 0 : px("padding-top") + px("padding-bottom") + px("border-top-width") + px("border-bottom-width"));
  return { x: width ? rect.width / width || 1 : 1, y: height ? rect.height / height || 1 : 1 };
}
