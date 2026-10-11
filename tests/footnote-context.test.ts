import { describe, expect, it } from "vitest";
import { footnoteContext, sourceFootnoteLabels, withFootnoteContext } from "../src/footnote-context";
import { parseListDocument } from "../src/list-model";

describe("breadcrumb footnote context", () => {
  it("retains definitions outside the list without assigning new reference numbers", () => {
    const text = "Earlier[^a].\n\n- Paragraph[^b].\n\n  Another paragraph.\n  - Child\n\n[^a]: First definition.\n[^b]: Second definition.\n\n    Continuation paragraph.";
    const nodes = parseListDocument(text), node = nodes.find(n => n.kind === "unordered")!;
    expect(node.markdown).toBe("Paragraph[^b].\n\nAnother paragraph.");
    expect(node.footnotes?.identifiers.has("b")).toBe(true);
    expect(sourceFootnoteLabels(node.markdown!).get("b")).toEqual(["[^b]"]);
    expect(withFootnoteContext(node.markdown!, node.footnotes)).toContain("[^b]: Second definition.\n\n    Continuation paragraph.");
  });
  it("ignores fake definitions and leaves non-footnote syntax untouched", () => {
    const text = "---\nvalue: fake[^b]\n---\n\n`code[^b]` and \\[^b] and $x[^b]$.\n\n```md\n[^fake]: code\nref[^b]\n```\n\nInline ^[Note] then real[^a] and later[^b].\n\n[^a]: One[^b]\n[^b]: Two";
    const context = footnoteContext(text)!;
    expect([...context.identifiers]).toEqual(["a", "b"]);
    expect(context.definitions).not.toContain("fake");
    expect(withFootnoteContext("`code[^missing]` and \\[^missing] and $x[^missing]$", context)).not.toContain("<sup");
    expect(withFootnoteContext("[[Note[^b]]] and ![[Note[^a]]]", context)).toBe("[[Note[^b]]] and ![[Note[^a]]]");
  });
  it("keeps numeric, named, and repeated source identifiers in occurrence order", () => {
    const labels = sourceFootnoteLabels("First[^11], then[^2], named[^MiXeD], repeated[^mixed], later[^13] and[^12].");
    expect([...labels]).toEqual([
      ["11", ["[^11]"]], ["2", ["[^2]"]], ["mixed", ["[^MiXeD]", "[^mixed]"]],
      ["13", ["[^13]"]], ["12", ["[^12]"]],
    ]);
  });
  it("does not consume label occurrences from code, escapes, math, wikilinks, or inline notes", () => {
    const labels = sourceFootnoteLabels("`code[^FAKE]` and \\[^FAKE] and $x[^FAKE]$ and [[Note[^FAKE]]] and ^[inline[^FAKE]], then real[^fake].");
    expect([...labels]).toEqual([["fake", ["[^fake]"]]]);
  });
  it("preserves dangling references as superscripts without fabricating a note", () => {
    expect(withFootnoteContext("Text[^2]", footnoteContext("- Text[^2]")))
      .toBe('Text<sup class="footnote-ref">[^2]</sup>');
    expect(withFootnoteContext("Text^[An inline footnote]"))
      .toBe("Text^[An inline footnote]");
  });
  it("escapes literal reference identifiers before inserting source HTML", () => {
    expect(withFootnoteContext("Text[^<tag>&]"))
      .toBe('Text<sup class="footnote-ref">[^&lt;tag&gt;&amp;]</sup>');
  });
});
