import { describe, expect, it } from "vitest";
import { listLabel } from "src/list-label";

const label = (text: string) => listLabel(text, entity => ({ "&amp;": "&", "&#58;": ":" })[entity] ?? entity);
describe("breadcrumb display labels", () => {
  it("preserves colons, escapes, Unicode, and punctuation around inline code", () => {
    expect(label("In `List Tree` version `2.0.0`: ✓")).toBe("In List Tree version 2.0.0: ✓");
    expect(label("Colon\\: &amp; &#58; C:\\\\Notes 🙂")).toBe("Colon: & : C:\\Notes 🙂");
    expect(label("`&amp; \\: [[literal]]` and **bold:** _text_")).toBe("&amp; \\: [[literal]] and bold: text");
  });
  it("uses link labels and image descriptions without destinations or raw tags", () => {
    expect(label('[A:B](https://example.com "title") and ![picture:](image.png)')).toBe("A:B and picture:");
    expect(label("[[Note#Heading|Alias:]] ![[Note|Image:]] <https://example.com/a:b>")).toBe("Alias: Image: https://example.com/a:b");
    expect(label("<b>Title:</b> ~~old~~ ^block-id")).toBe("Title: old");
    expect(label("literal [unclosed and * marker")).toBe("literal [unclosed and * marker");
  });
});
