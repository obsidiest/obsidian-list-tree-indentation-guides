import { elementScale, pointWithinHost } from "./list-renderer";

/** Embed drawings live outside the transclusion/CodeMirror DOM. They cannot
 * enlarge a scroll container, change widget height, or become source content. */
export class RenderedLayer {
  readonly svg: SVGSVGElement;
  readonly container: HTMLElement;
  readonly portal: boolean;
  private highlight: { element: HTMLElement; rect: DOMRect } | null = null;

  constructor(readonly host: HTMLElement) {
    this.portal = !!host.closest(".internal-embed");
    this.container = this.portal
      ? host.ownerDocument.body.createDiv({ cls: "ltig-embed-layer", attr: { "aria-hidden": "true" } })
      : host;
    this.svg = this.container.createSvg("svg", {
      cls: "ltig-rendered-overlay",
      attr: { "aria-hidden": "true", width: "0", height: "0", preserveAspectRatio: "none" },
    });
  }

  copyStyle(): void {
    if (!this.portal) return;
    const style = this.host.ownerDocument.defaultView!.getComputedStyle(this.host);
    for (const key of Array.from(style)) {
      if (!key.startsWith("--ltig-")) continue;
      const value = style.getPropertyValue(key);
      if (this.container.style.getPropertyValue(key) !== value)
        this.container.style.setProperty(key, value);
    }
    this.container.style.setProperty("font-size", style.fontSize);
  }

  position(): void {
    if (this.svg.parentElement !== this.container) this.container.append(this.svg);
    if (!this.portal) {
      this.svg.setAttribute("width", String(this.host.clientWidth));
      this.svg.setAttribute("height", String(this.host.clientHeight));
      return;
    }
    const win = this.host.ownerDocument.defaultView!;
    const rect = this.host.getBoundingClientRect();
    let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
    let right = Math.min(win.innerWidth, rect.right), bottom = Math.min(win.innerHeight, rect.bottom);
    // Every scroll/clip ancestor matters, including superordinate embeds.
    for (let parent = this.host.parentElement; parent; parent = parent.parentElement) {
      const style = win.getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const scale = elementScale(parent);
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, box.left + parent.clientLeft * scale.x);
        right = Math.min(right, box.left + (parent.clientLeft + parent.clientWidth) * scale.x);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, box.top + parent.clientTop * scale.y);
        bottom = Math.min(bottom, box.top + (parent.clientTop + parent.clientHeight) * scale.y);
      }
    }
    const visible = this.host.isConnected && rect.width > 0 && rect.height > 0 && right > left && bottom > top;
    this.container.style.setProperty("display", visible ? "block" : "none");
    if (!visible) return;
    const zero = pointWithinHost(new DOMRect(0, 0, 0, 0), this.host, 1);
    const one = pointWithinHost(new DOMRect(1, 1, 0, 0), this.host, 1);
    const sx = 1 / (one.x - zero.x), sy = 1 / (one.y - zero.y);
    const x = zero.x + left / sx, y = zero.y + top / sy;
    this.container.style.setProperty("left", `${left}px`);
    this.container.style.setProperty("top", `${top}px`);
    this.container.style.setProperty("width", `${right - left}px`);
    this.container.style.setProperty("height", `${bottom - top}px`);
    this.svg.setAttribute("width", String(right - left));
    this.svg.setAttribute("height", String(bottom - top));
    this.svg.setAttribute("viewBox", `${x} ${y} ${(right - left) / sx} ${(bottom - top) / sy}`);
    if (this.highlight?.element.isConnected) {
      const { element, rect: area } = this.highlight;
      element.style.setProperty("left", `${(area.x - x) * sx}px`);
      element.style.setProperty("top", `${(area.y - y) * sy}px`);
      element.style.setProperty("width", `${area.width * sx}px`);
      element.style.setProperty("height", `${area.height * sy}px`);
    }
  }

  addHighlight(rect: DOMRect): HTMLElement {
    const element = this.container.createDiv({
      cls: "ltig-breadcrumb-main-highlight ltig-breadcrumb-rendered-highlight",
      attr: { "aria-hidden": "true" },
    });
    this.highlight = { element, rect };
    if (this.portal) this.position();
    else {
      element.style.setProperty("left", `${rect.x}px`);
      element.style.setProperty("top", `${rect.y}px`);
      element.style.setProperty("width", `${rect.width}px`);
      element.style.setProperty("height", `${rect.height}px`);
    }
    return element;
  }

  remove(): void {
    this.highlight?.element.remove();
    this.svg.remove();
    if (this.portal) this.container.remove();
  }
}
