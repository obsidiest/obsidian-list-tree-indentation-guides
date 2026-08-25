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
const COLOR_INPUT_CLASS = "ltig-style-settings-color-input";
const STYLE_COLOR_DEFAULTS = new Map<string, string>([
  ["ltig-thread-fallback-color-light", "#777777"],
  ["ltig-thread-fallback-color-dark", "#888888"],
  ["ltig-thread-override-color-light", "#777777"],
  ["ltig-thread-override-color-dark", "#888888"],
]);

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

    enhanceStyleSettingsControls(ownerDocument);

    const Observer =
      ownerDocument.defaultView?.MutationObserver ??
      (typeof MutationObserver === "undefined" ? null : MutationObserver);
    if (Observer === null) {
      return;
    }

    const observer = new Observer((mutations) => {
      if (mutations.some(isRelevantStyleSettingsMutation)) {
        enhanceStyleSettingsControls(ownerDocument);
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

function enhanceStyleSettingsControls(root: ParentNode): void {
  enhanceStyleSettingsNumberControls(root);
  enhanceStyleSettingsColorControls(root);
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

/**
 * Style Settings' Pickr-backed color controls can fail to commit on some
 * Obsidian/Windows combinations. These four controls intentionally use
 * Style Settings' reliable variable-text persistence and add a native color
 * input beside it. Updating either control keeps the other synchronized.
 */
export function enhanceStyleSettingsColorControls(root: ParentNode): number {
  let enhanced = 0;

  for (const row of findColorRows(root)) {
    const settingId = readStyleSettingId(row);
    const fallback =
      settingId === null ? undefined : STYLE_COLOR_DEFAULTS.get(settingId);
    const control = row.querySelector<HTMLElement>(".setting-item-control");
    const textInput = control?.querySelector<HTMLInputElement>(
      'input[type="text"]:not(.ltig-style-settings-number-input)',
    );
    if (
      fallback === undefined ||
      control === undefined ||
      control === null ||
      textInput === undefined ||
      textInput === null ||
      control.querySelector(`.${COLOR_INPUT_CLASS}`) !== null
    ) {
      continue;
    }

    const ownerDocument = textInput.ownerDocument;
    const colorInput = control.createEl("input");
    colorInput.type = "color";
    colorInput.className = COLOR_INPUT_CLASS;
    colorInput.value = normalizeHexColor(textInput.value) ?? fallback;
    const settingName = row
      .querySelector(".setting-item-name")
      ?.textContent?.trim();
    colorInput.setAttribute(
      "aria-label",
      settingName === undefined || settingName === ""
        ? "Choose color"
        : `${settingName} picker`,
    );
    colorInput.setAttribute("title", "Choose color");

    const EventConstructor = ownerDocument.defaultView?.Event ?? Event;
    const commitColor = (commit: boolean): void => {
      textInput.value = colorInput.value.toLowerCase();
      textInput.dispatchEvent(
        new EventConstructor("input", { bubbles: true }),
      );
      if (commit) {
        textInput.dispatchEvent(
          new EventConstructor("change", { bubbles: true }),
        );
      }
    };
    const syncFromText = (): void => {
      const normalized = normalizeHexColor(textInput.value);
      if (normalized !== null) {
        colorInput.value = normalized;
      }
    };

    colorInput.addEventListener("input", () => commitColor(false));
    colorInput.addEventListener("change", () => commitColor(true));
    textInput.addEventListener("input", syncFromText);
    textInput.addEventListener("change", syncFromText);

    const resetButton = control.querySelector<HTMLElement>(".clickable-icon");
    resetButton?.addEventListener("click", () => {
      const schedule = ownerDocument.defaultView?.setTimeout ?? setTimeout;
      schedule(syncFromText, 0);
    });
    control.insertBefore(colorInput, textInput);
    enhanced += 1;
  }

  return enhanced;
}

export function normalizeHexColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const shortMatch = /^#([\da-f])([\da-f])([\da-f])$/u.exec(normalized);
  if (shortMatch !== null) {
    return `#${shortMatch[1]}${shortMatch[1]}${shortMatch[2]}${shortMatch[2]}${shortMatch[3]}${shortMatch[3]}`;
  }
  return /^#[\da-f]{6}$/u.test(normalized) ? normalized : null;
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

function findColorRows(root: ParentNode): Element[] {
  const rows = new Set<Element>();
  const candidate = root as QueryableNode;

  if (candidate.matches?.(STYLE_SETTING_MARKER_SELECTOR) === true) {
    addColorSettingRow(candidate as unknown as Element, rows);
  }
  for (const marker of Array.from(
    root.querySelectorAll<Element>(STYLE_SETTING_MARKER_SELECTOR),
  )) {
    addColorSettingRow(marker, rows);
  }
  return Array.from(rows);
}

function addColorSettingRow(marker: Element, rows: Set<Element>): void {
  const row = marker.matches(".setting-item")
    ? marker
    : marker.closest(".setting-item");
  if (row !== null && readStyleSettingId(row) !== null) {
    rows.add(row);
  }
}

function readStyleSettingId(row: Element): string | null {
  const dataIds = [
    row.getAttribute("data-id"),
    ...Array.from(row.querySelectorAll<Element>("[data-id]"), (element) =>
      element.getAttribute("data-id"),
    ),
  ];
  for (const dataId of dataIds) {
    if (dataId === null) {
      continue;
    }
    for (const settingId of STYLE_COLOR_DEFAULTS.keys()) {
      if (dataId === settingId || dataId.endsWith(`@@${settingId}`)) {
        return settingId;
      }
    }
  }
  return null;
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
