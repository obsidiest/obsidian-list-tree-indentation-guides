import { describe, expect, it } from "vitest";
import {
  buildRoundedThreadPath,
  buildVisibleListModel,
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
      { breakBefore: true, depth: 1 },
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
});
