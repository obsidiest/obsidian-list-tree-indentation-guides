const STYLE_SETTING_MARKER_SELECTOR = [
  '[data-id^="ltig-"]',
  '[data-id^="list-tree-indentation-guides@@ltig-"]',
  '[data-id*="@@ltig-"]',
].join(", ");
const STYLE_SETTINGS_SECTION_SELECTOR = [
  '.style-settings-heading[data-id="list-tree-indentation-guides"]',
  '.style-settings-heading[data-id$="@@list-tree-indentation-guides"]',
].join(", ");
const NUMBER_INPUT_CLASS = "ltig-style-settings-number-input";

type QueryableNode = ParentNode & {
  matches?: (selector: string) => boolean;
};

export class StyleSettingsPrecisionControls {
  private readonly observers = new Map<Document, MutationObserver>();

  public start(documents?: Iterable<Document>): void {
    const initialDocuments = documents ?? getDefaultDocuments();
    for (const ownerDocument of initialDocuments) {
      this.observeDocument(ownerDocument);
    }
  }

  public observeDocument(ownerDocument: Document | null | undefined): void {
    if (!ownerDocument?.body || this.observers.has(ownerDocument)) {
      return;
    }

    enhanceStyleSettingsNumberControls(ownerDocument);

    const Observer =
      ownerDocument.defaultView?.MutationObserver ??
      (typeof MutationObserver === "undefined" ? null : MutationObserver);
    if (Observer === null) {
      return;
    }

    const observer = new Observer((mutations) => {
      if (mutations.some(isRelevantStyleSettingsMutation)) {
        enhanceStyleSettingsNumberControls(ownerDocument);
      }
    });
    observer.observe(ownerDocument.body, {
      attributes: true,
      attributeFilter: ["data-id"],
      childList: true,
      subtree: true,
    });
    this.observers.set(ownerDocument, observer);
  }

  public stop(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();
  }
}

export function enhanceStyleSettingsNumberControls(root: ParentNode): number {
  const rows = findSliderRows(root);
  let enhanced = 0;

  for (const row of rows) {
    const control = row.querySelector<HTMLElement>(".setting-item-control");
    const slider = row.querySelector<HTMLInputElement>('input[type="range"]');
    if (
      control === null ||
      slider === null ||
      control.querySelector(`.${NUMBER_INPUT_CLASS}`) !== null
    ) {
      continue;
    }

    const ownerDocument = slider.ownerDocument;
    const numberInput = control.createEl("input");
    numberInput.type = "text";
    numberInput.inputMode = "decimal";
    numberInput.className = NUMBER_INPUT_CLASS;
    numberInput.value = slider.value;
    numberInput.min = slider.min;
    numberInput.max = slider.max;
    numberInput.step = "any";
    const settingName = row
      .querySelector(".setting-item-name")
      ?.textContent?.trim();
    numberInput.setAttribute(
      "aria-label",
      settingName === undefined || settingName === ""
        ? "Precise slider value"
        : `${settingName} precise value`,
    );
    numberInput.setAttribute("title", "Enter a precise value");

    let syncingFromNumberInput = false;

    const syncFromSlider = (): void => {
      if (!syncingFromNumberInput) {
        numberInput.value = slider.value;
      }
    };
    const syncToSlider = (eventType: "input" | "change"): boolean => {
      const value = parseCompleteInRangeNumber(
        numberInput.value,
        slider.min,
        slider.max,
      );
      if (value === null) {
        return false;
      }

      const originalStep = slider.step;
      syncingFromNumberInput = true;
      try {
        slider.step = "any";
        const sliderChanged = slider.value !== value;
        slider.value = value;
        const EventConstructor = ownerDocument.defaultView?.Event ?? Event;
        if (eventType === "change" && sliderChanged) {
          slider.dispatchEvent(new EventConstructor("input", { bubbles: true }));
        }
        slider.dispatchEvent(new EventConstructor(eventType, { bubbles: true }));
      } finally {
        slider.step = originalStep;
        syncingFromNumberInput = false;
      }
      return true;
    };

    slider.addEventListener("input", syncFromSlider);
    slider.addEventListener("change", syncFromSlider);
    numberInput.addEventListener("input", () => syncToSlider("input"));
    numberInput.addEventListener("change", () => {
      if (!syncToSlider("change")) {
        syncFromSlider();
      }
    });

    const resetButton = control.querySelector<HTMLElement>(".clickable-icon");
    resetButton?.addEventListener("click", () => {
      const schedule = ownerDocument.defaultView?.setTimeout ?? setTimeout;
      schedule(syncFromSlider, 0);
    });
    control.insertBefore(numberInput, resetButton);
    enhanced += 1;
  }

  return enhanced;
}

export function parseCompleteInRangeNumber(
  value: string,
  minimumValue: string,
  maximumValue: string,
): string | null {
  const rawValue = value.trim();
  if (!isCompleteNumber(rawValue)) {
    return null;
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const minimum = parseFiniteNumber(minimumValue);
  const maximum = parseFiniteNumber(maximumValue);
  if (
    (minimum !== null && numericValue < minimum) ||
    (maximum !== null && numericValue > maximum)
  ) {
    return null;
  }

  return rawValue;
}

function isCompleteNumber(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value);
}

function parseFiniteNumber(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultDocuments(): Document[] {
  return typeof document === "undefined" ? [] : [document];
}

function findSliderRows(root: ParentNode): Element[] {
  const rows = new Set<Element>();
  const candidate = root as QueryableNode;

  if (candidate.matches?.(STYLE_SETTING_MARKER_SELECTOR) === true) {
    addSettingRow(candidate as unknown as Element, rows);
  }
  for (const marker of Array.from(
    root.querySelectorAll<Element>(STYLE_SETTING_MARKER_SELECTOR),
  )) {
    addSettingRow(marker, rows);
  }

  const sections: Element[] = [];
  if (candidate.matches?.(STYLE_SETTINGS_SECTION_SELECTOR) === true) {
    sections.push(candidate as unknown as Element);
  }
  sections.push(
    ...Array.from(
      root.querySelectorAll<Element>(STYLE_SETTINGS_SECTION_SELECTOR),
    ),
  );
  for (const section of sections) {
    const container = section.nextElementSibling;
    if (container?.matches(".style-settings-container") !== true) {
      continue;
    }
    for (const row of Array.from(
      container.querySelectorAll<Element>(".setting-item"),
    )) {
      if (row.querySelector('input[type="range"]') !== null) {
        rows.add(row);
      }
    }
  }

  return Array.from(rows);
}

function addSettingRow(marker: Element, rows: Set<Element>): void {
  const row = marker.matches(".setting-item")
    ? marker
    : marker.closest(".setting-item");
  if (row !== null && row.querySelector('input[type="range"]') !== null) {
    rows.add(row);
  }
}

function isRelevantStyleSettingsMutation(mutation: MutationRecord): boolean {
  const target = toElement(mutation.target);
  if (target !== null && isStyleSettingsElement(target)) {
    return true;
  }
  return Array.from(mutation.addedNodes).some(
    (node) => {
      const element = toElement(node);
      return element !== null && isStyleSettingsElement(element);
    },
  );
}

function isStyleSettingsElement(element: Element): boolean {
  if (
    element.matches(STYLE_SETTING_MARKER_SELECTOR) ||
    element.matches(STYLE_SETTINGS_SECTION_SELECTOR) ||
    element.closest(STYLE_SETTING_MARKER_SELECTOR) !== null
  ) {
    return true;
  }
  return (
    element.querySelector(STYLE_SETTING_MARKER_SELECTOR) !== null ||
    element.querySelector(STYLE_SETTINGS_SECTION_SELECTOR) !== null
  );
}

function toElement(node: Node): Element | null {
  return node.nodeType === node.ELEMENT_NODE ? (node as Element) : null;
}
