import { parser, Strikethrough } from "@lezer/markdown";
type SyntaxNode = ReturnType<typeof parser.parse>["topNode"];

const labelParser = parser.configure([
  Strikethrough,
  {
    defineNodes: ["WikiLink"],
    parseInline: [{
      name: "WikiLink",
      before: "Link",
      parse(context, next, position) {
        if (next !== 91 && next !== 33) return -1;
        const rest = context.slice(position, context.end);
        const match = /^!?\[\[([^\]\n]+)\]\]/.exec(rest);
        return match
          ? context.addElement(context.elt("WikiLink", position, position + match[0].length))
          : -1;
      },
    }],
  },
]);

/** Project Markdown into a non-interactive label, preserving literal punctuation.
 * A syntax tree keeps escapes/entities out of code spans and link destinations
 * out of the label. No source HTML is inserted into the popover. */
export function listLabel(source: string, decodeEntity: (entity: string) => string): string {
  const text = source.replace(/\s+\^[\w-]+\s*$/, "");
  const children = (node: SyntaxNode, end = node.to): string => {
    let result = "", position = node.from;
    for (let child = node.firstChild; child && child.from < end; child = child.nextSibling) {
      result += text.slice(position, child.from) + visit(child);
      position = child.to;
    }
    return result + text.slice(position, end);
  };
  const visit = (node: SyntaxNode): string => {
    const raw = text.slice(node.from, node.to);
    switch (node.name) {
      case "InlineCode": {
        const code = text.slice(node.firstChild!.to, node.lastChild!.from).replace(/\n/g, " ");
        return /^ .+ $/.test(code) && /\S/.test(code) ? code.slice(1, -1) : code;
      }
      case "Escape": return raw.slice(1);
      case "Entity": return decodeEntity(raw);
      case "WikiLink": {
        const target = raw.replace(/^!?\[\[|\]\]$/g, "");
        return target.includes("|") ? target.slice(target.indexOf("|") + 1) : target;
      }
      case "Link":
      case "Image": {
        const opening = node.firstChild!;
        let closing = opening.nextSibling;
        while (closing && !(closing.name === "LinkMark" && text.slice(closing.from, closing.to) === "]"))
          closing = closing.nextSibling;
        return closing ? children(node, closing.from).slice(opening.to - opening.from) : children(node);
      }
      case "Autolink": return raw.slice(1, -1);
      case "HTMLTag":
      case "EmphasisMark":
      case "StrikethroughMark": return "";
      case "HardBreak": return " ";
      default: return node.firstChild ? children(node) : raw;
    }
  };
  return visit(labelParser.parse(text).topNode);
}
