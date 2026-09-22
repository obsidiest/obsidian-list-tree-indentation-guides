import type { SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type { ListThreadOptions } from "./list-model";

export type ListMode = "livePreview" | "source" | "reading";
export const BREADCRUMB_DEFAULTS = {
  listHoverBreadcrumb: true,
  breadcrumbUnmarkedHeadActivation: true,
  breadcrumbFieldActivation: false,
  breadcrumbMarkerActivation: true,
  breadcrumbLivePreview: true,
  breadcrumbSource: true,
  breadcrumbReading: true,
  breadcrumbExpandTitles: true,
  breadcrumbMarkers: true,
  breadcrumbGuides: true,
  breadcrumbGuidesLivePreview: true,
  breadcrumbGuidesSource: true,
  breadcrumbGuidesReading: true,
  breadcrumbConnectSeparateListBlocks: false,
  breadcrumbThreading: false,
  breadcrumbThreadingLivePreview: true,
  breadcrumbThreadingSource: true,
  breadcrumbThreadingReading: true,
  breadcrumbThreadSelected: false,
  breadcrumbThreadActive: true,
  breadcrumbThreadAll: false,
  breadcrumbThreadJoinActive: false,
  breadcrumbThreadJoinAll: false,
  breadcrumbThreadUnmarked: true,
  breadcrumbThreadOrphan: true,
  breadcrumbThreadOrphanActive: true,
  breadcrumbThreadOrphanAll: false,
  breadcrumbNavigateBeforeTimeout: true,
  breadcrumbNavigateAfterTimeout: false,
  globalBreadcrumbTimeoutEnabled: true,
  globalBreadcrumbTimeoutSeconds: 0.01,
  livePreviewBreadcrumbTimeoutEnabled: false,
  livePreviewBreadcrumbTimeoutSeconds: 0.01,
  sourceBreadcrumbTimeoutEnabled: false,
  sourceBreadcrumbTimeoutSeconds: 0.01,
  readingBreadcrumbTimeoutEnabled: false,
  readingBreadcrumbTimeoutSeconds: 0.01,
};
export type BreadcrumbSettings = typeof BREADCRUMB_DEFAULTS;
export type BreadcrumbKey = keyof BreadcrumbSettings;
type BoolKey = {
  [K in BreadcrumbKey]: BreadcrumbSettings[K] extends boolean ? K : never;
}[BreadcrumbKey];
export const MAX_TIMEOUT_SECONDS = 2_147_483.647;
export function validTimeout(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_TIMEOUT_SECONDS
  );
}
export function normalizeBreadcrumbSettings(
  loaded: Record<string, unknown>,
): BreadcrumbSettings {
  return Object.fromEntries(
    Object.entries(BREADCRUMB_DEFAULTS).map(([key, fallback]) => [
      key,
      typeof fallback === "boolean"
        ? typeof loaded[key] === "boolean"
          ? loaded[key]
          : fallback
        : validTimeout(loaded[key])
          ? loaded[key]
          : fallback,
    ]),
  ) as BreadcrumbSettings;
}
export function breadcrumbTimeout(
  settings: BreadcrumbSettings,
  mode: ListMode,
): number {
  const scope = settings[`${mode}BreadcrumbTimeoutEnabled`] ? mode : "global";
  return (
    (settings[`${scope}BreadcrumbTimeoutEnabled`]
      ? settings[`${scope}BreadcrumbTimeoutSeconds`]
      : 0.01) * 1000
  );
}
export function breadcrumbEnabled(
  settings: BreadcrumbSettings,
  mode: ListMode,
): boolean {
  return (
    settings.listHoverBreadcrumb &&
    settings[
      mode === "livePreview"
        ? "breadcrumbLivePreview"
        : mode === "source"
          ? "breadcrumbSource"
          : "breadcrumbReading"
    ]
  );
}
export function breadcrumbFeature(
  settings: BreadcrumbSettings,
  mode: ListMode,
  feature: "Guides" | "Threading",
): boolean {
  const suffix =
    mode === "livePreview"
      ? "LivePreview"
      : mode === "source"
        ? "Source"
        : "Reading";
  return (
    breadcrumbEnabled(settings, mode) &&
    settings[`breadcrumb${feature}`] &&
    settings[`breadcrumb${feature}${suffix}`]
  );
}
export function breadcrumbThreadOptions(
  settings: BreadcrumbSettings,
  mode: ListMode,
): ListThreadOptions {
  return {
    enabled: breadcrumbFeature(settings, mode, "Threading"),
    active: settings.breadcrumbThreadActive,
    all: settings.breadcrumbThreadAll,
    unmarked: settings.breadcrumbThreadUnmarked,
    orphan: settings.breadcrumbThreadOrphan,
    orphanActive: settings.breadcrumbThreadOrphanActive,
    orphanAll: settings.breadcrumbThreadOrphanAll,
    joinActive: settings.breadcrumbThreadJoinActive,
    joinAll: settings.breadcrumbThreadJoinAll,
  };
}

export function breadcrumbSettingDefinitions(
  get: () => BreadcrumbSettings,
): SettingDefinitionItem<BreadcrumbKey>[] {
  type Item = SettingGroupItem<BreadcrumbKey>;
  const root: BoolKey[] = ["listHoverBreadcrumb"];
  const off = (parents: BoolKey[]) => () => parents.some((k) => !get()[k]);
  const toggle = (
    key: BoolKey,
    name: string,
    parents = root,
    desc = "",
  ): Item => ({
    name,
    desc,
    aliases: ["list hover breadcrumb", name],
    control: {
      type: "toggle",
      key,
      defaultValue: BREADCRUMB_DEFAULTS[key],
      disabled: off(parents),
    },
  });
  const heading = (name: string): Item => ({
    name,
    render: (setting) => {
      setting.setHeading();
    },
  });
  const items: Item[] = [
    toggle(
      "listHoverBreadcrumb",
      "List Hover Breadcrumb",
      [],
      "Show a floating, navigable ancestor hierarchy for the hovered list.",
    ),
    toggle(
      "breadcrumbUnmarkedHeadActivation",
      "Unmarked List Head Hover Breadcrumb Activation",
      root,
      "Allow breadcrumbs on the immediately preceding unmarked list head, using the item or gutter activation scope below. Independent of list threading.",
    ),
    heading("List Hover Breadcrumb Activation Scope"),
    toggle(
      "breadcrumbFieldActivation",
      "Full-Width List Item List Hover Breadcrumb Activation",
      root,
      "Activate from the left gutter through the complete list row. Includes unmarked heads when Unmarked List Head Hover Breadcrumb Activation is enabled. Takes priority over marker activation.",
    ),
    toggle(
      "breadcrumbMarkerActivation",
      "Full-Width List Marker List Hover Breadcrumb Activation",
      root,
      "Activate from the left gutter through the list marker. For enabled unmarked heads, activate only in the left gutter (right gutter in RTL). With both scope toggles off, only actual markers activate breadcrumbs.",
    ),
    heading("List Hover Breadcrumb Viewing Modes"),
  ];
  for (const [suffix, label] of [
    ["LivePreview", "Live Preview"],
    ["Source", "Source mode"],
    ["Reading", "Reading mode"],
  ] as const) {
    items.push(
      toggle(`breadcrumb${suffix}`, `List Hover Breadcrumb in ${label}`),
    );
  }
  items.push(
    toggle(
      "breadcrumbExpandTitles",
      "Expand Long List Items in List Hover Breadcrumb",
      root,
      "Wrap complete list-item text onto additional lines. Disable for a single line with an ellipsis.",
    ),
    heading("List Hover Breadcrumb List Markers"),
    toggle("breadcrumbMarkers", "List Hover Breadcrumb List Markers"),
  );
  for (const [feature, label] of [
    ["Guides", "Static Tree Indentation Guides"],
    ["Threading", "Threading"],
  ] as const) {
    const title = `List Hover Breadcrumb ${label}`;
    items.push(heading(title), toggle(`breadcrumb${feature}`, title));
    const parents: BoolKey[] = [...root, `breadcrumb${feature}`];
    for (const [suffix, mode] of [
      ["LivePreview", "Live Preview"],
      ["Source", "Source mode"],
      ["Reading", "Reading mode"],
    ] as const) {
      items.push(
        toggle(`breadcrumb${feature}${suffix}`, `${title} in ${mode}`, [
          ...parents,
          `breadcrumb${suffix}`,
        ]),
      );
    }
    if (feature === "Guides") {
      items.push(
        toggle(
          "breadcrumbConnectSeparateListBlocks",
          "Connect Separate List Blocks in List Hover Breadcrumb",
          parents,
        ),
      );
      continue;
    }
    items.push(
      toggle(
        "breadcrumbThreadSelected",
        "Active Selected List Threading in List Hover Breadcrumb",
        parents,
        "Use the selected breadcrumb row instead of the hovered row. This is the breadcrumb equivalent of Active Cursor List Threading.",
      ),
      toggle(
        "breadcrumbThreadActive",
        "Active List Item Threading in List Hover Breadcrumb",
        parents,
      ),
      toggle(
        "breadcrumbThreadJoinActive",
        "Thread separate list blocks that are only separated by a blank line",
        [...parents, "breadcrumbThreadActive"],
      ),
      toggle(
        "breadcrumbThreadAll",
        "All Branches of an Active List Threading in List Hover Breadcrumb",
        parents,
      ),
      toggle(
        "breadcrumbThreadJoinAll",
        "Thread separate list blocks that are only separated by a blank line",
        [...parents, "breadcrumbThreadAll"],
      ),
      toggle(
        "breadcrumbThreadUnmarked",
        "Unmarked List Head List Threading in List Hover Breadcrumb",
        parents,
      ),
      toggle(
        "breadcrumbThreadOrphan",
        "Active Orphan List Threading in List Hover Breadcrumb",
        parents,
      ),
      toggle(
        "breadcrumbThreadOrphanActive",
        "Active Orphan List Item Threading in List Hover Breadcrumb",
        [...parents, "breadcrumbThreadOrphan"],
      ),
      toggle(
        "breadcrumbThreadOrphanAll",
        "All Branches of an Active Orphan List Threading in List Hover Breadcrumb",
        [...parents, "breadcrumbThreadOrphan"],
      ),
    );
  }
  items.push(
    heading("List Hover Breadcrumb Navigation"),
    toggle(
      "breadcrumbNavigateBeforeTimeout",
      "Hover Over a Given Breadcrumb List Item to Change the Screen Focus to the Corresponding List Item in the Main UI Before the Breadcrumb Popover Timeout",
      root,
      "Preview hovered or keyboard-focused items without moving the editor caret. Restore the previous scroll position when the popover closes unless navigation after timeout is enabled. Clicking always commits navigation.",
    ),
    toggle(
      "breadcrumbNavigateAfterTimeout",
      "Hover Over a Given Breadcrumb List Item to Change the Screen Focus to the Corresponding List Item in the Main UI After the Breadcrumb Popover Timeout",
      root,
      "Keep or apply the last hovered item when the dismissal timer expires. Escape cancels deferred navigation.",
    ),
    heading("List Hover Breadcrumb Popover Timeout"),
  );
  for (const [scope, label] of [
    ["global", "Global"],
    ["livePreview", "Live Preview Mode"],
    ["source", "Source Mode"],
    ["reading", "Reading Mode"],
  ] as const) {
    const key = `${scope}BreadcrumbTimeoutSeconds` as const;
    items.push(
      toggle(
        `${scope}BreadcrumbTimeoutEnabled`,
        scope === "global"
          ? "Globally Control List Hover Breadcrumb Timeout"
          : `Control ${label} List Hover Breadcrumb Timeout Individually`,
        root,
        "Individual mode controls override the global timeout. The default is 0.01 seconds.",
      ),
      {
        name: `${label} List Hover Breadcrumb Popover Timeout`,
        desc: "Seconds after leaving the item, the popover, and the gap between them. Decimals are supported; 0 closes immediately.",
        control: {
          type: "number",
          key,
          defaultValue: BREADCRUMB_DEFAULTS[key],
          min: 0,
          max: MAX_TIMEOUT_SECONDS,
          step: "any",
          disabled: off([...root, `${scope}BreadcrumbTimeoutEnabled`]),
        },
      },
    );
  }
  return [{ type: "group", heading: "List Hover Breadcrumb", items }];
}
