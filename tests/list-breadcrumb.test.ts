import { describe, it, expect } from "vitest";
import {
  breadcrumbEntries,
  listAncestors,
  listNodeAtLine,
  listThreadPlan,
  parseListDocument,
  type ListThreadOptions,
} from "../src/list-model";
import {
  breadcrumbEnabled,
  breadcrumbFeature,
  breadcrumbSettingDefinitions,
  breadcrumbTimeout,
  BREADCRUMB_DEFAULTS,
} from "../src/breadcrumb-settings";
import { normalizeSettings } from "../src/types";

const options: ListThreadOptions = {
  enabled: true,
  active: true,
  all: false,
  unmarked: true,
  orphan: true,
  orphanActive: true,
  orphanAll: false,
  joinActive: false,
  joinAll: false,
};
describe("source list hierarchy", () => {
  it.each(["-", "1.", "2."])(
    "threads %s items from an unmarked list head",
    (marker) => {
      const nodes = parseListDocument(
        `List head\n${marker} first\n${marker} second`,
      );
      expect(nodes.map((n) => n.kind)).toEqual([
        "head",
        marker === "-" ? "unordered" : "ordered",
        marker === "-" ? "unordered" : "ordered",
      ]);
      expect(listAncestors(nodes, 2)).toEqual([0, 2]);
      expect(listThreadPlan(nodes, 2, options)).toEqual([2]);
    },
  );
  it("keeps duplicate labels and wrapped continuation positions distinct", () => {
    const nodes = parseListDocument(
      "- same\n  - same\n    continuation\n- same",
    );
    expect(listAncestors(nodes, 1)).toEqual([0, 1]);
    expect(listNodeAtLine(nodes, 2)).toBe(1);
    expect(listNodeAtLine(nodes, 3)).toBe(2);
  });
  it("excludes frontmatter and fenced code and retains task markers", () => {
    const nodes = parseListDocument(
      "---\nthings:\n- hidden\n---\n\n```md\n- hidden\n```\n\n- [ ] one\n  - [x] two",
    );
    expect(nodes.map((n) => n.marker)).toEqual(["☐", "☑"]);
  });
  it("separates blank-line blocks unless their thread join toggle is enabled", () => {
    const nodes = parseListDocument(
      "- first\n  - child\n\n- second\n  - child",
    );
    expect(nodes[0].block).not.toBe(nodes[2].block);
    expect(nodes[0].cluster).toBe(nodes[2].cluster);
    expect(listThreadPlan(nodes, 3, { ...options, orphanAll: true })).toEqual([
      2, 3,
    ]);
    expect(
      listThreadPlan(nodes, 3, { ...options, orphanAll: true, joinAll: true }),
    ).toEqual([0, 1, 2, 3]);
    expect(listThreadPlan(nodes, 3, { ...options, joinActive: true })).toEqual([
      2, 3,
    ]);
  });
  it("never joins across ordinary content", () => {
    const nodes = parseListDocument("- one\n\nParagraph\n\n- two");
    expect(
      listThreadPlan(nodes, 1, { ...options, joinAll: true, orphanAll: true }),
    ).toEqual([1]);
  });
  it("shows ancestor path by default, broadens for all-branches threading", () => {
    const nodes = parseListDocument("- root\n  - a\n  - b\n    - c");
    expect(breadcrumbEntries(nodes, 1, { ...options, enabled: false })).toEqual(
      [0, 1],
    );
    expect(
      breadcrumbEntries(nodes, 1, { ...options, orphanAll: true }),
    ).toEqual([0, 1, 2, 3]);
    expect(listThreadPlan(nodes, 0, { ...options, orphan: false })).toEqual([]);
  });
  it("retains unmarked ancestry independently of unmarked threading", () => {
    const nodes = parseListDocument("Head:\n1. parent\n   - child");
    expect(breadcrumbEntries(nodes, 2, { ...options, unmarked: false })).toEqual([0, 1, 2]);
    expect(listThreadPlan(nodes, 2, { ...options, unmarked: false })).toEqual([2]);
  });
});

describe("breadcrumb settings", () => {
  it("preserves previous settings and defaults new controls independently", () => {
    const s = normalizeSettings({
      enableListThreading: true,
      breadcrumbMarkers: false,
      readingBreadcrumbTimeoutSeconds: 0.125,
    });
    expect(s.enableListThreading).toBe(true);
    expect(s.breadcrumbThreading).toBe(false);
    expect(s.breadcrumbMarkers).toBe(false);
    expect(s.readingBreadcrumbTimeoutSeconds).toBe(0.125);
    expect(
      normalizeSettings({ globalBreadcrumbTimeoutSeconds: NaN })
        .globalBreadcrumbTimeoutSeconds,
    ).toBe(0.01);
  });
  it("supports per-mode activation and independent guide/thread gates", () => {
    const s = {
      ...BREADCRUMB_DEFAULTS,
      breadcrumbThreading: true,
      breadcrumbSource: false,
    };
    expect(breadcrumbEnabled(s, "source")).toBe(false);
    expect(breadcrumbFeature(s, "source", "Guides")).toBe(false);
    expect(breadcrumbFeature(s, "reading", "Threading")).toBe(true);
    expect(
      breadcrumbFeature(
        { ...s, listHoverBreadcrumb: false },
        "reading",
        "Guides",
      ),
    ).toBe(false);
  });
  it("prioritizes decimal per-mode timeouts without changing other modes", () => {
    const s = {
      ...BREADCRUMB_DEFAULTS,
      globalBreadcrumbTimeoutSeconds: 0.25,
      readingBreadcrumbTimeoutEnabled: true,
      readingBreadcrumbTimeoutSeconds: 0.125,
    };
    expect(breadcrumbTimeout(s, "reading")).toBe(125);
    expect(breadcrumbTimeout(s, "source")).toBe(250);
    expect(
      breadcrumbTimeout(
        { ...s, globalBreadcrumbTimeoutEnabled: false },
        "source",
      ),
    ).toBe(10);
  });
  it("defines every control and disables descendants through all parents", () => {
    const s = { ...BREADCRUMB_DEFAULTS };
    const groups = breadcrumbSettingDefinitions(() => s);
    const controls = groups
      .flatMap((g) => ("items" in g ? (g.items ?? []) : []))
      .flatMap((i) => (i && "control" in i && i.control ? [i.control] : []));
    expect(new Set(controls.map((c) => c.key))).toEqual(
      new Set(Object.keys(BREADCRUMB_DEFAULTS)),
    );
    const orphan = controls.find(
      (c) => c.key === "breadcrumbThreadOrphanActive",
    )!;
    expect(typeof orphan.disabled === "function" && orphan.disabled()).toBe(
      true,
    );
    s.breadcrumbThreading = true;
    expect(typeof orphan.disabled === "function" && orphan.disabled()).toBe(
      false,
    );
    s.breadcrumbThreadOrphan = false;
    expect(typeof orphan.disabled === "function" && orphan.disabled()).toBe(
      true,
    );
    s.listHoverBreadcrumb = false;
    for (const control of controls)
      if (control.key !== "listHoverBreadcrumb") {
        expect(
          typeof control.disabled === "function" && control.disabled(),
        ).toBe(true);
      }
  });
});
