export interface MarkerGeometry {
  /** Every visible part of the marker, including a task's preceding number. */
  bounds: DOMRect;
  /** The primary marker: numeral, bullet glyph, or unordered task checkbox. */
  anchor: DOMRect;
}

export function markerGeometry(anchor: DOMRect, control?: DOMRect | null): MarkerGeometry {
  if (!control) return { bounds: anchor, anchor };
  const left = Math.min(anchor.left, control.left), top = Math.min(anchor.top, control.top);
  return { anchor, bounds: new DOMRect(left, top,
    Math.max(anchor.right, control.right) - left, Math.max(anchor.bottom, control.bottom) - top) };
}

/** Text nodes only: an enclosing formatting span can also contain a checkbox,
 * padding, and hidden task syntax. None of those belongs to the numeral. */
export function ordinalTextRect(element: HTMLElement): DOMRect | null {
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const match = text.data.match(/\d+[.)]/u);
    const parent = text.parentElement;
    if (!match || !parent || parent.closest(".task-list-label, .hmd-hidden-token")) continue;
    if (element.ownerDocument.defaultView?.getComputedStyle(parent).visibility === "hidden") continue;
    const range = element.ownerDocument.createRange();
    range.setStart(text, match.index!);
    range.setEnd(text, match.index! + match[0].length);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

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
