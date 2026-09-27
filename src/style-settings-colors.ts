import type { App } from "obsidian";

const SECTION = "list-tree-indentation-guides";
export const THEMED_COLOR_DEFAULTS = new Map<string, readonly [string, string]>([
  ["ltig-guide-color", ["#777777", "#888888"]],
  ["ltig-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["ltig-thread-color-2", ["#c99a00", "#ffc400"]],
  ["ltig-thread-color-3", ["#79b800", "#a8e600"]],
  ["ltig-thread-color-4", ["#008ea3", "#00c8df"]],
  ["ltig-thread-color-5", ["#316fd1", "#5794ff"]],
  ["ltig-thread-color-6", ["#7547c7", "#a66cff"]],
  ["ltig-thread-color-7", ["#b83782", "#e64fa3"]],
  ["ltig-thread-color-8", ["#b83782", "#e64fa3"]],
  ["ltig-breadcrumb-background", ["#ffffff", "#202225"]],
  ["ltig-breadcrumb-border-color", ["#d7d7d7", "#46484d"]],
  ["ltig-breadcrumb-text-color", ["#252525", "#dcddde"]],
  ["ltig-breadcrumb-title-color", ["#666666", "#a7a9ad"]],
  ["ltig-breadcrumb-current-color", ["#4c78cc", "#7aa2f7"]],
  ["ltig-breadcrumb-hover-color", ["#e7edf8", "#343b4a"]],
  ["ltig-breadcrumb-main-color", ["#4c78cc", "#7aa2f7"]],
  ["ltig-breadcrumb-list-marker-color", ["#777777", "#888888"]],
  ["ltig-breadcrumb-guide-color", ["#777777", "#888888"]],
  ["ltig-breadcrumb-thread-color-1", ["#d94f00", "#ff5a00"]],
  ["ltig-breadcrumb-thread-color-2", ["#c99a00", "#ffc400"]],
  ["ltig-breadcrumb-thread-color-3", ["#79b800", "#a8e600"]],
  ["ltig-breadcrumb-thread-color-4", ["#008ea3", "#00c8df"]],
  ["ltig-breadcrumb-thread-color-5", ["#316fd1", "#5794ff"]],
  ["ltig-breadcrumb-thread-color-6", ["#7547c7", "#a66cff"]],
  ["ltig-breadcrumb-thread-color-7", ["#b83782", "#e64fa3"]],
  ["ltig-breadcrumb-thread-color-8", ["#b83782", "#e64fa3"]],
]);

/** Narrow, feature-detected integration with Style Settings 1.0.9's manager.
 * Keep its schema and @@light/@@dark keys so existing values/export/import work.
 * setSettings returns save()'s promise; setSetting's Pickr callback does not. */
export interface StyleSettingsColorStore {
  getSetting(section: string, id: string): unknown;
  setSettings(values: Record<string, string>): Promise<void>;
}
export function styleSettingsColorStore(app: App): StyleSettingsColorStore | null {
  const plugins = (app as App & { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
  const plugin = plugins?.getPlugin?.("obsidian-style-settings") as { settingsManager?: Partial<StyleSettingsColorStore> } | undefined;
  const manager = plugin?.settingsManager;
  return typeof manager?.getSetting === "function" && typeof manager.setSettings === "function"
    ? manager as StyleSettingsColorStore : null;
}

export function pickerHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{3,4}$/.test(hex)) return "#" + [...hex.slice(1)].map(x => x + x).join("");
  return /^#(?:[\da-f]{6}|[\da-f]{8})$/.test(hex) ? hex : null;
}

function savedColorHex(value: unknown): string | null {
  const hex = pickerHex(value);
  if (hex || typeof value !== "string") return hex;
  // Style Settings imports can contain RGB/HSL or named colors. Convert their
  // display value without rewriting the saved setting until the user saves.
  if (!/^(?:rgba?|hsla?)\(|^[a-z]+$/i.test(value.trim()) || !CSS.supports("color", value)) return null;
  const context = createFragment().createEl("canvas").getContext("2d");
  if (!context) return null;
  context.fillStyle = value;
  const normalized = context.fillStyle;
  const direct = pickerHex(normalized);
  if (direct) return direct;
  const channels = normalized.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  return "#" + channels.map((channel, index) => Math.round(index === 3 ? channel * 255 : channel).toString(16).padStart(2, "0")).join("");
}

function colorUpdates(store: StyleSettingsColorStore, key: string, hex: string): Record<string, string> {
  const updates: Record<string, string> = {};
  // Pickr can leave a malformed hex/non-finite color behind. Style Settings
  // 1.0.9 parses every themed color when saving, so one such value blocks CSS
  // generation even when editing a different field. Repair only known-bad
  // values in our own controls; preserve valid colors and other plugins' data.
  for (const [id, defaults] of THEMED_COLOR_DEFAULTS) {
    for (const [index, theme] of ["light", "dark"].entries()) {
      const storedKey = `${id}@@${theme}`, value = store.getSetting(SECTION, storedKey);
      if (typeof value === "string" && ((value.trim().startsWith("#") && !pickerHex(value)) || /NaN|Infinity/i.test(value)))
        updates[`${SECTION}@@${storedKey}`] = defaults[index];
    }
  }
  updates[`${SECTION}@@${key}`] = hex;
  return updates;
}

interface ColorRow {
  row: HTMLElement;
  original: HTMLElement;
  controls: HTMLElement;
  sync: () => void;
}

export class StyleSettingsColors {
  private rows = new Map<HTMLElement, ColorRow>();
  private dialogs = new Map<Document, HTMLDialogElement>();
  constructor(private readonly getStore: () => StyleSettingsColorStore | null) {}

  enhance(doc: Document): void {
    for (const [row, record] of this.rows) {
      if (!row.isConnected) { this.restore(record); this.rows.delete(row); }
      else if (row.ownerDocument === doc) record.sync();
    }
    const store = this.getStore();
    if (!store) return;
    for (const row of Array.from(doc.querySelectorAll<HTMLElement>('.setting-item[data-id]'))) {
      if (this.rows.has(row)) continue;
      const id = (row.dataset.id ?? "").replace(`${SECTION}@@`, "");
      const defaults = THEMED_COLOR_DEFAULTS.get(id);
      const original = row.querySelector<HTMLElement>(".themed-color-wrapper");
      const control = row.querySelector<HTMLElement>(".setting-item-control");
      if (!defaults || !original || !control) continue;
      const name = row.querySelector(".setting-item-name")?.textContent ?? "Color";
      const controls = control.createDiv({ cls: "ltig-style-color-controls" });
      const updates: (() => void)[] = [];
      for (const [index, theme] of ["light", "dark"].entries()) {
        const key = `${id}@@${theme}`, fallback = defaults[index];
        const title = `${name} (${theme})`;
        const button = controls.createEl("button", { text: theme === "light" ? "Light" : "Dark",
          cls: "ltig-style-color-swatch", attr: { type: "button", "aria-label": `${title} picker` } });
        const value = () => savedColorHex(store.getSetting(SECTION, key)) ?? fallback;
        const sync = () => { button.style.setProperty("--ltig-chosen-color", value()); button.title = `${title}: ${value()}`; };
        button.addEventListener("click", () => this.open(doc, title, key, value(), fallback, sync));
        updates.push(sync);
      }
      // Leave the upstream component owned by Style Settings; only replace its
      // presentation. Unload restores it, without monkey-patching Pickr itself.
      original.classList.add("ltig-style-color-original");
      const sync = () => updates.forEach(update => update());
      this.rows.set(row, { row, original, controls, sync });
      sync();
    }
  }

  removeDocument(doc: Document): void {
    this.dialogs.get(doc)?.close();
    for (const [row, record] of this.rows) if (row.ownerDocument === doc) {
      this.restore(record); this.rows.delete(row);
    }
  }
  stop(): void {
    for (const dialog of this.dialogs.values()) dialog.close();
    for (const record of this.rows.values()) this.restore(record);
    this.rows.clear();
  }
  private restore(record: ColorRow): void {
    record.controls.remove();
    record.original.classList.remove("ltig-style-color-original");
  }
  private open(doc: Document, title: string, key: string, initial: string, fallback: string,
    sync: () => void): void {
    this.dialogs.get(doc)?.close();
    const dialog = doc.body.createEl("dialog", { cls: "ltig-color-dialog", attr: { "aria-label": title } });
    this.dialogs.set(doc, dialog);
    dialog.createEl("h3", { text: title });
    const form = dialog.createEl("form");
    const fields = form.createDiv({ cls: "ltig-color-dialog-fields" });
    const picker = fields.createEl("input", { type: "color", attr: { "aria-label": "Choose color" } });
    const text = fields.createEl("input", { type: "text", attr: { "aria-label": "Hex color", spellcheck: "false" } });
    const status = form.createDiv({ cls: "ltig-color-dialog-status", attr: { role: "status" } });
    const actions = form.createDiv({ cls: "ltig-color-dialog-actions" });
    const reset = actions.createEl("button", { text: "Default", attr: { type: "button" } });
    const cancel = actions.createEl("button", { text: "Cancel", attr: { type: "button" } });
    const save = actions.createEl("button", { text: "Save", cls: "mod-cta", attr: { type: "submit" } });
    const set = (value: string) => { text.value = value; picker.value = value.slice(0, 7); };
    set(initial);
    text.addEventListener("input", () => {
      const hex = pickerHex(text.value);
      if (hex) picker.value = hex.slice(0, 7);
      text.removeAttribute("aria-invalid");
      status.textContent = "";
    });
    picker.addEventListener("input", () => set(picker.value + (pickerHex(text.value)?.slice(7) ?? "")));
    reset.addEventListener("click", () => set(fallback));
    cancel.addEventListener("click", () => dialog.close());
    let saving = false;
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("close", () => {
      if (this.dialogs.get(doc) === dialog) this.dialogs.delete(doc);
      dialog.remove();
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (saving) return;
      const hex = pickerHex(text.value), store = this.getStore();
      if (!hex || !store) {
        status.textContent = !hex ? "Enter a hex color, such as #7aa2f7." : "Enable Style Settings to save this color.";
        text.setAttribute("aria-invalid", "true");
        return;
      }
      saving = true;
      for (const control of [picker, text, reset, cancel, save]) control.disabled = true;
      status.textContent = "Saving…";
      // Preserve the original Style Settings storage keys and await both disk
      // persistence and CSS regeneration before reporting success/closing.
      void Promise.resolve().then(() => store.setSettings(colorUpdates(store, key, hex))).then(() => {
        sync();
        dialog.close();
      }).catch((error: unknown) => {
        saving = false;
        for (const control of [picker, text, reset, cancel, save]) control.disabled = false;
        status.textContent = "Could not save the color. Please try again.";
        console.error("List Tree Indentation Guides: color save failed", error);
      });
    });
    dialog.showModal();
    text.focus();
    text.select();
  }
}
