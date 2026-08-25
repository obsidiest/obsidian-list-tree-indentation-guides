const READING_VIEW_SELECTOR = ".markdown-rendered";
const BRANCH_CLASS = "ltig-reading-branch";
const HEAD_CLASS = "ltig-reading-list-head";
const ITEM_CLASS = "ltig-reading-item";
const LIST_CLASS = "ltig-reading-list";
const LIST_ACTIVE_ITEM_THREADING_CLASS =
  "ltig-reading-active-item-threading";
const LIST_ALL_BRANCHES_THREADING_CLASS =
  "ltig-reading-all-branches-threading";
const ORPHAN_LIST_CLASS = "ltig-reading-orphan-list";
const LIST_WITH_HEAD_CLASS = "ltig-reading-list-with-head";

export function decorateReadingLists(root: ParentNode): number {
  const lists = collectElements(root, "ul, ol");
  let decorated = 0;

  for (const list of lists) {
    list.classList.add(LIST_CLASS);
    list.classList.remove(
      LIST_ACTIVE_ITEM_THREADING_CLASS,
      LIST_ALL_BRANCHES_THREADING_CLASS,
      LIST_WITH_HEAD_CLASS,
      ORPHAN_LIST_CLASS,
    );
    const previous = list.previousElementSibling;
    const isTopLevelList = !list.closest(`.${ITEM_CLASS}`);
    const hasListHead =
      isTopLevelList &&
      previous !== null &&
      !previous.matches("ul, ol") &&
      previous.textContent?.trim() !== "";
    if (hasListHead) {
      previous.classList.add(HEAD_CLASS);
      list.classList.add(LIST_WITH_HEAD_CLASS);
    } else if (isTopLevelList) {
      list.classList.add(ORPHAN_LIST_CLASS);
    }
    if (isTopLevelList) {
      const ownerBody = list.ownerDocument.body;
      const orphanThreadingEnabled =
        !hasListHead &&
        ownerBody.classList.contains("ltig-thread-orphan-enabled");
      list.classList.toggle(
        LIST_ACTIVE_ITEM_THREADING_CLASS,
        hasListHead
          ? ownerBody.classList.contains("ltig-thread-active-item-enabled")
          : orphanThreadingEnabled &&
              ownerBody.classList.contains(
                "ltig-thread-orphan-active-item-enabled",
              ),
      );
      list.classList.toggle(
        LIST_ALL_BRANCHES_THREADING_CLASS,
        hasListHead
          ? ownerBody.classList.contains("ltig-thread-all-branches-enabled")
          : orphanThreadingEnabled &&
              ownerBody.classList.contains(
                "ltig-thread-orphan-all-branches-enabled",
              ),
      );
    }
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
  for (const head of Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(`.${HEAD_CLASS}`),
  )) {
    head.classList.remove(HEAD_CLASS);
  }
  for (const list of Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(`.${LIST_CLASS}`),
  )) {
    list.classList.remove(
      LIST_ACTIVE_ITEM_THREADING_CLASS,
      LIST_ALL_BRANCHES_THREADING_CLASS,
      LIST_CLASS,
      LIST_WITH_HEAD_CLASS,
      ORPHAN_LIST_CLASS,
    );
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
