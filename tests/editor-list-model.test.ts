import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { collectEditorListGroups } from "src/editor-guides";

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
});
