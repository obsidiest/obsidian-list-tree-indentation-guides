import { describe, expect, it } from "vitest";
import {
  buildRoundedThreadGroupPath,
  buildRoundedThreadPath,
  buildVisibleListModel,
  findAncestorContinuationEndIndex,
  findListRowAtClientY,
  getMarkdownListMarkerKind,
  hasMarkdownListMarker,
  isBlankListBlockSeparator,
  isDefiniteListBlockBoundary,
  selectListMarkerRect,
  type VisibleListRow,
} from "src/editor-guides";

function modelForDepths(depths: readonly number[]) {
  return buildVisibleListModel(depths.map((depth) => ({ depth })));
}

describe("visible editor list model", () => {
  it("collects sibling groups independently at every nesting level", () => {
    const model = modelForDepths([1, 2, 2, 1, 2, 2]);

    expect(model.groups).toHaveLength(3);
    expect(model.groups.map((group) => group.itemIndices)).toEqual([
      [0, 3],
      [1, 2],
      [4, 5],
    ]);
  });

  it("assigns stable depths and parents for a hovered nested path", () => {
    const model = modelForDepths([1, 2, 3, 2, 1]);

    expect(model.items.map((item) => item.depth)).toEqual([1, 2, 3, 2, 1]);
    expect(model.items.map((item) => item.parentIndex)).toEqual([
      null,
      0,
      1,
      0,
      null,
    ]);
  });

  it("starts new list groups after a definite non-list boundary", () => {
    const rows: VisibleListRow[] = [
      { depth: 1 },
      { depth: 2 },
      { boundaryBefore: "content", depth: 1 },
      { depth: 2 },
    ];
    const model = buildVisibleListModel(rows);

    expect(model.groups.map((group) => group.itemIndices)).toEqual([
      [0],
      [1],
      [2],
      [3],
    ]);
    expect(model.items.map((item) => item.parentIndex)).toEqual([
      null,
      0,
      null,
      2,
    ]);
    expect(model.items.map((item) => item.blockIndex)).toEqual([0, 0, 1, 1]);
  });

  it("connects separate list blocks only when explicitly requested", () => {
    const rows: VisibleListRow[] = [
      { depth: 1 },
      { depth: 2 },
      { boundaryBefore: "content", depth: 1 },
      { depth: 2 },
    ];
    const model = buildVisibleListModel(rows, true);

    expect(model.groups.map((group) => group.itemIndices)).toEqual([
      [0, 2],
      [1],
      [3],
    ]);
    expect(model.items.map((item) => item.blockIndex)).toEqual([0, 0, 0, 0]);
  });

  it("separates blank-line list blocks by default", () => {
    const rows: VisibleListRow[] = [
      { depth: 1 },
      { depth: 2 },
      { boundaryBefore: "blank-line", depth: 1 },
      { depth: 2 },
    ];
    const model = buildVisibleListModel(rows);

    expect(model.items.map((item) => item.blockIndex)).toEqual([0, 0, 1, 1]);
    expect(model.items.map((item) => item.parentIndex)).toEqual([
      null,
      0,
      null,
      2,
    ]);
  });

  it("merges only blank-line boundaries for the all-branches opt-in", () => {
    const rows: VisibleListRow[] = [
      { depth: 1 },
      { boundaryBefore: "blank-line", depth: 1 },
      { boundaryBefore: "content", depth: 1 },
    ];
    const model = buildVisibleListModel(rows, {
      treatBlankLineSeparatedListBlocksAsOne: true,
    });

    expect(model.items.map((item) => item.blockIndex)).toEqual([0, 0, 1]);
    expect(model.groups.map((group) => group.itemIndices)).toEqual([
      [0, 1],
      [2],
    ]);
  });

  it("lets the static bridge opt-in connect every boundary kind", () => {
    const rows: VisibleListRow[] = [
      { depth: 1 },
      { boundaryBefore: "blank-line", depth: 1 },
      { boundaryBefore: "content", depth: 1 },
    ];
    const model = buildVisibleListModel(rows, {
      connectSeparateListBlocks: true,
    });

    expect(model.items.map((item) => item.blockIndex)).toEqual([0, 0, 0]);
    expect(model.groups.map((group) => group.itemIndices)).toEqual([[0, 1, 2]]);
  });

  it("keeps deep visible rows usable when their parent is above the viewport", () => {
    const model = modelForDepths([3, 4, 3]);

    expect(model.items.map((item) => item.parentIndex)).toEqual([
      null,
      0,
      null,
    ]);
    expect(model.groups.map((group) => group.itemIndices)).toEqual([
      [0, 2],
      [1],
    ]);
  });

  it("builds a rounded editor thread elbow without changing its endpoints", () => {
    expect(
      buildRoundedThreadPath({
        endX: 80,
        endY: 60,
        radius: 8,
        startX: 40,
        startY: 20,
      }),
    ).toBe("M 40 20 V 52 Q 40 60 48 60 H 80");
  });

  it("builds all-branches threading with one shared spine and every elbow", () => {
    expect(
      buildRoundedThreadGroupPath({
        connectors: [
          { endX: 80, y: 40 },
          { endX: 80, y: 60 },
        ],
        radius: 8,
        spineX: 40,
        startY: 20,
      }),
    ).toBe("M 40 20 V 52 Q 40 60 48 60 H 80 M 40 40 H 80");
  });

  it("hit-tests the full vertical area of every visible list row", () => {
    const rows = [
      { bottom: 24, top: 4 },
      { bottom: 54, top: 30 },
    ];

    expect(findListRowAtClientY(rows, 4)).toBe(0);
    expect(findListRowAtClientY(rows, 18)).toBe(0);
    expect(findListRowAtClientY(rows, 42)).toBe(1);
    expect(findListRowAtClientY(rows, 27)).toBeNull();
    expect(findListRowAtClientY(rows, Number.NaN)).toBeNull();
  });

  it("recognizes definite list-block boundaries, including blockquotes", () => {
    expect(isDefiniteListBlockBoundary("plain paragraph")).toBe(true);
    expect(isDefiniteListBlockBoundary("# Heading")).toBe(true);
    expect(isDefiniteListBlockBoundary("> quoted paragraph")).toBe(true);
    expect(isDefiniteListBlockBoundary("   list continuation")).toBe(false);
    expect(isDefiniteListBlockBoundary(">   list continuation")).toBe(false);
    expect(isDefiniteListBlockBoundary("   ")).toBe(false);
    expect(isBlankListBlockSeparator("   ")).toBe(true);
    expect(isBlankListBlockSeparator(">   ")).toBe(true);
    expect(isBlankListBlockSeparator("> quoted paragraph")).toBe(false);
  });

  it("requires real unordered or ordered marker syntax for modeled rows", () => {
    expect(hasMarkdownListMarker("- item")).toBe(true);
    expect(hasMarkdownListMarker("    * nested item")).toBe(true);
    expect(hasMarkdownListMarker("> 12) quoted ordered item")).toBe(true);
    expect(hasMarkdownListMarker("+")).toBe(true);
    expect(hasMarkdownListMarker("plain list head")).toBe(false);
    expect(hasMarkdownListMarker("1.0 is not a list item")).toBe(false);
    expect(getMarkdownListMarkerKind("- item")).toBe("unordered");
    expect(getMarkdownListMarkerKind("  12) item")).toBe("ordered");
    expect(getMarkdownListMarkerKind("plain list head")).toBeNull();
  });

  it("anchors ordered connectors to the rendered number instead of its layout box", () => {
    const lineRect = { bottom: 30, left: 0, right: 800, top: 10 };
    const elementRect = { bottom: 30, left: 0, right: 120, top: 10 };
    const textRect = { bottom: 28, left: 92, right: 116, top: 12 };

    expect(
      selectListMarkerRect("ordered", lineRect, elementRect, textRect),
    ).toEqual(textRect);
    expect(
      selectListMarkerRect("unordered", lineRect, elementRect, textRect),
    ).toEqual(elementRect);
    expect(
      selectListMarkerRect(
        "ordered",
        lineRect,
        elementRect,
        { bottom: 20, left: 92, right: 92, top: 20 },
      ),
    ).toEqual(elementRect);
  });

  it("ends inferred ancestor spines when their visible subtree outdents", () => {
    const rows: VisibleListRow[] = [
      { depth: 5 },
      { depth: 5 },
      { depth: 4 },
      { depth: 3 },
      { depth: 2 },
    ];

    expect(findAncestorContinuationEndIndex(rows, 4)).toBe(2);
    expect(findAncestorContinuationEndIndex(rows, 3)).toBe(3);
    expect(findAncestorContinuationEndIndex(rows, 2)).toBe(4);
  });

  it("ends inferred ancestor spines at list-block boundaries by default", () => {
    const rows: VisibleListRow[] = [
      { depth: 4 },
      { depth: 4 },
      { boundaryBefore: "content", depth: 4 },
    ];

    expect(findAncestorContinuationEndIndex(rows, 3)).toBe(1);
    expect(findAncestorContinuationEndIndex(rows, 3, true)).toBe(2);
  });
});
