import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildRoundedThreadPath,
  collectEditorListGroups,
} from "src/editor-guides";

function groupsFor(markdownSource: string) {
  const state = EditorState.create({
    doc: markdownSource,
    extensions: [markdown()],
  });
  return collectEditorListGroups(state);
}

describe("editor list model", () => {
  it("collects sibling groups independently at every nesting level", () => {
    const groups = groupsFor(
      [
        "- Parent",
        "  - Child one",
        "  - Child two",
        "- Second parent",
        "  1. Ordered child",
        "  2. Ordered child two",
      ].join("\n"),
    );

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.items.length)).toEqual([2, 2, 2]);
    expect(groups.map((group) => group.ordered)).toEqual([false, false, true]);
  });

  it("finds content positions after bullet and ordered-list whitespace", () => {
    const source = "- Example\n\n10. Tenth";
    const groups = groupsFor(source);

    expect(
      source.slice(groups[0]?.items[0]?.contentFrom).startsWith("Example"),
    ).toBe(true);
    expect(
      source.slice(groups[1]?.items[0]?.contentFrom).startsWith("Tenth"),
    ).toBe(true);
  });

  it("supports task-list items without treating the checkbox as a list mark", () => {
    const source = "- [ ] Planned\n- [x] Finished";
    const groups = groupsFor(source);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
    expect(
      source.slice(groups[0]?.items[0]?.contentFrom).startsWith("[ ] Planned"),
    ).toBe(true);
  });

  it("assigns stable depths and parents for a hovered nested path", () => {
    const source = [
      "- Root",
      "  - Child",
      "    1. Grandchild",
      "  - Sibling child",
      "- Second root",
    ].join("\n");
    const groups = groupsFor(source);
    const items = groups
      .flatMap((group) => group.items)
      .sort((left, right) => left.markerFrom - right.markerFrom);

    expect(items.map((item) => item.depth)).toEqual([1, 2, 3, 2, 1]);
    expect(items.map((item) => item.parentMarkerFrom)).toEqual([
      null,
      items[0]?.markerFrom,
      items[1]?.markerFrom,
      items[0]?.markerFrom,
      null,
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
