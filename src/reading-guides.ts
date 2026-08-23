const READING_VIEW_SELECTOR = ".markdown-reading-view";
const BRANCH_CLASS = "ltig-reading-branch";
const ITEM_CLASS = "ltig-reading-item";

export function decorateReadingLists(root: ParentNode): number {
  const lists = collectElements(root, "ul, ol");
  let decorated = 0;

  for (const list of lists) {
    for (const child of Array.from(list.children)) {
      if (child.tagName !== "LI") {
        continue;
      }
      const item = child as HTMLLIElement;
      item.classList.add(ITEM_CLASS);
      if (hasDirectBranch(item)) {
        continue;
      }
      const branch = item.createSpan({
        cls: BRANCH_CLASS,
        attr: { "aria-hidden": "true" },
      });
      item.insertBefore(branch, item.firstChild);
      decorated += 1;
    }
  }

  return decorated;
}

export function decorateExistingReadingViews(ownerDocument: Document): number {
  let decorated = 0;
  for (const readingView of Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(READING_VIEW_SELECTOR),
  )) {
    decorated += decorateReadingLists(readingView);
  }
  return decorated;
}

export function removeReadingGuides(ownerDocument: Document): void {
  for (const branch of Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(`.${BRANCH_CLASS}`),
  )) {
    branch.remove();
  }
  for (const item of Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`),
  )) {
    item.classList.remove(ITEM_CLASS);
  }
}

function collectElements(root: ParentNode, selector: string): Element[] {
  const elements = new Set<Element>();
  const candidate = root as ParentNode & {
    matches?: (selector: string) => boolean;
  };
  if (candidate.matches?.(selector) === true) {
    elements.add(root as Element);
  }
  for (const element of Array.from(root.querySelectorAll(selector))) {
    elements.add(element);
  }
  return Array.from(elements);
}

function hasDirectBranch(item: HTMLLIElement): boolean {
  return Array.from(item.children).some((child) =>
    child.classList.contains(BRANCH_CLASS),
  );
}
