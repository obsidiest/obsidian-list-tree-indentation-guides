import { parser } from "@lezer/markdown";

/** Reference definitions are document-scoped, even when a popup renders one item. */
export interface FootnoteContext {
  definitions: string;
  numbers: ReadonlyMap<string, number>;
}

const referenceParser = parser.configure({
  defineNodes: ["FootnoteReference", "InlineFootnote", "MathSpan", "WikiLink"],
  parseInline: [{
    name: "FootnoteReference",
    before: "Link",
    parse(context, next, position) {
      if (next !== 91) return -1;
      const match = /^\[\^([^\]\s]+)\]/.exec(context.slice(position, context.end));
      return match ? context.addElement(context.elt("FootnoteReference", position, position + match[0].length)) : -1;
    },
  }, {
    name: "WikiLink",
    before: "FootnoteReference",
    parse(context, next, position) {
      if (next !== 91 && next !== 33) return -1;
      const source = context.slice(position, context.end);
      const start = source.startsWith("![[") ? 3 : source.startsWith("[[") ? 2 : -1;
      if (start < 0) return -1;
      const end = source.indexOf("]]", start);
      if (end < 0 || source.slice(start, end).includes("\n")) return -1;
      return context.addElement(context.elt("WikiLink", position, position + end + 2));
    },
  }, {
    name: "InlineFootnote",
    before: "Link",
    parse(context, next, position) {
      if (next !== 94 || context.char(position + 1) !== 91) return -1;
      let depth = 1;
      for (let end = position + 2; end < context.end; end++) {
        const char = context.char(end);
        if (char === 92) { end++; continue; }
        if (char === 91) depth++;
        if (char === 93 && --depth === 0)
          return context.addElement(context.elt("InlineFootnote", position, end + 1));
      }
      return -1;
    },
  }, {
    name: "MathSpan",
    before: "FootnoteReference",
    parse(context, next, position) {
      if (next !== 36) return -1;
      const source = context.slice(position, context.end);
      const delimiter = source.startsWith("$$") ? "$$" : "$";
      for (let end = delimiter.length; end < source.length; end++) {
        if (source[end] === "\\") { end++; continue; }
        if (source.startsWith(delimiter, end))
          return context.addElement(context.elt("MathSpan", position, position + end + delimiter.length));
      }
      return -1;
    },
  }],
});

function references(source: string): { from: number; to: number; id: string | null }[] {
  const result: { from: number; to: number; id: string | null }[] = [];
  referenceParser.parse(source).iterate({ enter(node) {
    if (node.name === "FootnoteReference" || node.name === "InlineFootnote")
      result.push({from: node.from, to: node.to,
        id: node.name === "InlineFootnote" ? null : source.slice(node.from + 2, node.to - 1).toLowerCase()});
  }});
  return result;
}

export function footnoteContext(source: string): FootnoteContext | undefined {
  if (!source.includes("[^")) return undefined;
  const excluded: { from: number; to: number }[] = [];
  parser.parse(source).iterate({ enter(node) {
    if (/^(FencedCode|CodeBlock|HTMLBlock)$/.test(node.name)) {
      excluded.push({from: node.from, to: node.to}); return false;
    }
  }});
  const yaml = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (yaml) excluded.push({from:0, to:yaml[0].length});
  const definitions: string[] = [], ids = new Set<string>();
  const ranges: { from: number; to: number }[] = [];
  for (const match of source.matchAll(/^ {0,3}\[\^([^\]\s]+)\]:[^\r\n]*(?:\r?\n(?:(?: {4}|\t)[^\r\n]*|[ \t]*(?=\r?\n)))*$/gm)) {
    if (excluded.some(r => match.index >= r.from && match.index < r.to)) continue;
    ids.add(match[1].toLowerCase()); definitions.push(match[0]);
    ranges.push({from:match.index, to:match.index+match[0].length});
  }
  const numbers = new Map<string, number>();
  let next = 1;
  for (const ref of references(source)) {
    if ([...excluded, ...ranges].some(r => ref.from >= r.from && ref.from < r.to)) continue;
    if (ref.id === null) next++;
    else if (ids.has(ref.id) && !numbers.has(ref.id)) numbers.set(ref.id, next++);
  }
  return {definitions:definitions.join("\n\n"), numbers};
}

export function withFootnoteContext(markdown: string, context?: FootnoteContext): string {
  if (!markdown.includes("[^")) return markdown;
  const refs = references(markdown).filter(ref => ref.id !== null);
  if (!refs.length) return markdown;
  // Obsidian 1.14.4 reduces a dangling reference to its bare identifier.
  // Preserve that source as superscript without inventing a definition/link.
  let result = markdown;
  for (const ref of refs.slice().reverse()) {
    if (context?.numbers.has(ref.id!)) continue;
    const literal = markdown.slice(ref.from, ref.to).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    result = result.slice(0, ref.from) + `<sup class="footnote-ref">${literal}</sup>` + result.slice(ref.to);
  }
  return context?.definitions ? `${result}\n\n${context.definitions}` : result;
}
