import { describe, expect, it } from "vitest";
import { footnoteContext, withFootnoteContext } from "../src/footnote-context";
import { parseListDocument } from "../src/list-model";

describe("breadcrumb footnote context", () => {
  it("retains definitions outside the list and original reference order", () => {
    const text = "Earlier[^a].\n\n- Paragraph[^b].\n\n  Another paragraph.\n  - Child\n\n[^a]: First definition.\n[^b]: Second definition.\n\n    Continuation paragraph.";
    const nodes = parseListDocument(text), node = nodes.find(n => n.kind === "unordered")!;
    expect(node.markdown).toBe("Paragraph[^b].\n\nAnother paragraph.");
    expect(node.footnotes?.numbers.get("b")).toBe(2);
    expect(withFootnoteContext(node.markdown!, node.footnotes)).toContain("[^b]: Second definition.\n\n    Continuation paragraph.");
  });
  it("does not count references in definitions, code, escapes, YAML, or math", () => {
    const text = "---\nvalue: fake[^b]\n---\n\n`code[^b]` and \\[^b] and $x[^b]$.\n\n```md\n[^fake]: code\nref[^b]\n```\n\nInline ^[Note] then real[^a] and later[^b].\n\n[^a]: One[^b]\n[^b]: Two";
    const context = footnoteContext(text)!;
    expect(context.numbers.get("a")).toBe(2);
    expect(context.numbers.get("b")).toBe(3);
    expect(context.definitions).not.toContain("fake");
    expect(withFootnoteContext("`code[^missing]` and \\[^missing] and $x[^missing]$", context)).not.toContain("<sup");
    expect(withFootnoteContext("[[Note[^b]]] and ![[Note[^a]]]", context)).toBe("[[Note[^b]]] and ![[Note[^a]]]");
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
