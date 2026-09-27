import { Component, MarkdownRenderer, sanitizeHTMLToDom, type App } from "obsidian";
import { listLabel } from "./list-label";
import type { ListNode } from "./list-model";

/** Obsidian can register cleanup after an asynchronous render has completed.
 * A closed scope must release those late registrations immediately. */
class RenderScope extends Component {
  private closed = false;
  override onunload(): void { this.closed = true; }
  override register(callback: () => unknown): void {
    if (this.closed) callback();
    else super.register(callback);
  }
  override addChild<T extends Component>(child: T): T {
    if (!this.closed) return super.addChild(child);
    child.unload();
    return child;
  }
}

/** A popup owns its render children, independently of the plugin's lifetime. */
export class BreadcrumbContent extends RenderScope {
  private disposed = false;

  dispose(): void {
    this.disposed = true;
    this.unload();
  }

  async render(app: App, node: ListNode, label: HTMLElement, sourcePath: string,
    renderedElement?: HTMLElement): Promise<void> {
    const markdown = (node.markdown ?? node.text).replace(/\s+\^[\w-]+\s*$/, "");
    const child = this.addChild(new RenderScope());
    try {
      if (node.plainText) {
        // Transclusions can lack source registration. Preserve their already
        // rendered inline content without interpreting literal text a second time.
        if (renderedElement) copyRenderedLabel(renderedElement, label);
        else label.textContent = node.text;
        return;
      }
      await MarkdownRenderer.render(app, markdown, label, sourcePath, child);
    } catch (error) {
      if (!this.disposed) {
        label.textContent = node.plainText ? node.text : listLabel(markdown, entity => entity);
        console.error("List Tree Indentation Guides: breadcrumb rendering failed", error);
      }
    } finally {
      // Rendering may finish after dismissal; never revive the popup or retain
      // an asynchronously created Markdown render child.
      if (this.disposed) {
        child.unload();
        this.removeChild(child);
      }
    }
  }
}

function copyRenderedLabel(source: HTMLElement, label: HTMLElement): void {
  const container = createFragment().createDiv();
  const excluded = "ul, ol, .list-bullet, .list-collapse-indicator, .task-list-item-checkbox, .ltig-rendered-overlay";
  const copy = (node: Node, parent: Node): void => {
    if (node.nodeType === 1 && (node as Element).matches(excluded)) return;
    const clone = node.cloneNode(false);
    parent.appendChild(clone);
    for (const child of Array.from(node.childNodes)) copy(child, clone);
  };
  for (const node of Array.from(source.childNodes)) copy(node, container);
  // Re-sanitize the fragment: preserve SVG/MathML/links, discard event handlers
  // and unsafe attributes rather than copying another plugin's active widgets.
  const safe = sanitizeHTMLToDom(container.innerHTML);
  label.replaceChildren(safe);
}
