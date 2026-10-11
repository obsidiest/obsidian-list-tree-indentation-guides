import { Component, MarkdownRenderer, sanitizeHTMLToDom, type App } from "obsidian";
import { listLabel } from "./list-label";
import type { ListNode } from "./list-model";
import { sourceFootnoteLabels, withFootnoteContext } from "./footnote-context";

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
        groupParagraphs(label);
        return;
      }
      const sourceLabels = sourceFootnoteLabels(markdown);
      const renderedLabels = renderedElement ? renderedFootnoteLabels(renderedElement) : undefined;
      const normalize = (): void => {
        if (this.disposed) return;
        // Only the item's content belongs in the row. Remove the definition
        // section before it can be painted, even while math is still pending.
        label.querySelectorAll(":scope > .footnotes").forEach(section => section.remove());
        const occurrences = new Map<string, number>();
        for (const link of Array.from(label.querySelectorAll<HTMLAnchorElement>("sup.footnote-ref a"))) {
          const key = footnoteKey(link), occurrence = occurrences.get(key) ?? 0;
          occurrences.set(key, occurrence + 1);
          const displayed = renderedLabels?.get(key)?.[occurrence] ?? sourceLabels.get(key)?.[occurrence];
          if (displayed !== undefined && link.textContent !== displayed) link.textContent = displayed;
        }
        groupParagraphs(label);
      };
      // MarkdownRenderer inserts HTML before its async postprocessors settle.
      // Observe first: a late renderer may insert or replace content on another
      // turn. Mutation observers normalize those writes before the next paint.
      const observer = new label.ownerDocument.defaultView!.MutationObserver(normalize);
      observer.observe(label, {childList:true, subtree:true, characterData:true});
      child.register(() => observer.disconnect());
      const pending = MarkdownRenderer.render(app, withFootnoteContext(markdown, node.footnotes), label, sourcePath, child);
      normalize();
      await pending;
      normalize();
    } catch (error) {
      if (!this.disposed) {
        label.textContent = node.plainText ? node.text : listLabel(markdown, entity => entity);
        groupParagraphs(label);
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

/** Give paragraph-only runs a real layout gap. Margins alone are vulnerable
 * to theme resets and to postprocessors wrapping each paragraph in a div.
 * Keep the renderer's nodes in place, and leave inline text and widgets alone. */
function groupParagraphs(label: HTMLElement): void {
  const groups = new Set<Element>(), blocks = new Set<Element>();
  const hasOnlyElements = (element: Element): boolean => Array.from(element.childNodes)
    .every(node => node.nodeType === 1 || node.nodeType === 8 || !node.textContent?.trim());
  const isWrapper = (element: Element): boolean => element.tagName === "DIV"
    && !element.matches(".internal-embed, .callout, .math-block, [contenteditable]");
  const paragraphChain = (element: Element): Element[] | undefined => {
    if (element.tagName === "P") return [element];
    if (!isWrapper(element) || element.children.length !== 1 || !hasOnlyElements(element)) return;
    const child = paragraphChain(element.children[0]);
    return child && [element, ...child];
  };
  const visit = (container: Element): void => {
    const children = Array.from(container.children);
    const chains = children.map(paragraphChain);
    if (children.length > 1 && hasOnlyElements(container) && chains.every(chain => chain !== undefined)) {
      groups.add(container);
      for (const chain of chains) for (const block of chain) blocks.add(block);
    } else {
      for (const child of children) if (isWrapper(child)) visit(child);
    }
  };
  visit(label);
  for (const [name, desired] of [["ltig-breadcrumb-paragraphs", groups], ["ltig-breadcrumb-paragraph-block", blocks]] as const) {
    // A postprocessor may replace a paragraph or wrap an existing run later.
    // Remove obsolete markers without changing the renderer's structure.
    for (const element of [label, ...Array.from(label.querySelectorAll(`.${name}`))]) {
      if (!desired.has(element)) element.classList.remove(name);
    }
    for (const element of desired) element.classList.add(name);
  }
}

function footnoteKey(link: HTMLAnchorElement): string {
  const id = link.dataset.footref?.toLowerCase() ?? "";
  // Obsidian assigns fragment-local synthetic IDs to inline notes. Match
  // those by occurrence, independently of named references.
  return id.startsWith("[inline") ? "" : id;
}

function renderedFootnoteLabels(source: HTMLElement): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const link of Array.from(source.querySelectorAll<HTMLAnchorElement>("sup.footnote-ref a"))) {
    let own = true;
    for (let parent = link.parentElement; parent && parent !== source; parent = parent.parentElement) {
      if (parent.matches("ul, ol, .footnotes, .internal-embed")) { own = false; break; }
    }
    if (!own) continue;
    const key = footnoteKey(link), values = labels.get(key) ?? [];
    values.push(link.textContent ?? "");
    labels.set(key, values);
  }
  return labels;
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
