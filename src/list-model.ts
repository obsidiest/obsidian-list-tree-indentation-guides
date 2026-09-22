import { parser } from "@lezer/markdown";

export type ListKind = "ordered" | "unordered" | "task" | "head";
export interface ListNode {
  index: number;
  line: number;
  endLine: number;
  text: string;
  /** DOM fallback text is already rendered; do not interpret it as Markdown again. */
  plainText?: boolean;
  marker: string;
  kind: ListKind;
  parent: number | null;
  depth: number;
  block: number;
  cluster: number;
}

/** Source positions, rather than labels, identify repeated list items. */
export function parseListDocument(text: string): ListNode[] {
  const lines = text.split(/\r?\n/);
  const offsets = [0];
  for (const match of text.matchAll(/\n/g)) offsets.push(match.index + 1);
  const lineAt = (pos: number) => {
    let low = 0,
      high = offsets.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (offsets[mid] <= pos) low = mid;
      else high = mid;
    }
    return low;
  };
  const raw: { line: number; end: number; parentLine: number | null }[] = [];
  const excluded = new Set<number>();
  parser.parse(text).iterate({
    enter: ({ node }) => {
      if (/^(FencedCode|CodeBlock|HTMLBlock)$/.test(node.name)) {
        for (let line = lineAt(node.from); line <= lineAt(node.to); line++)
          excluded.add(line);
        return false;
      }
      if (node.name !== "ListItem") return;
      let parent = node.parent;
      while (parent && parent.name !== "ListItem") parent = parent.parent;
      raw.push({
        line: lineAt(node.from),
        end: lineAt(Math.max(node.from, node.to - 1)),
        parentLine: parent ? lineAt(parent.from) : null,
      });
    },
  });
  // Obsidian also recognizes numbered items >1 immediately after plain text.
  // Preserve them without interpreting fenced code or frontmatter as lists.
  const known = new Set(raw.map((row) => row.line));
  let frontmatter = lines[0]?.trim() === "---";
  for (let line = 0; line < lines.length; line++) {
    if (frontmatter) {
      excluded.add(line);
      if (line > 0 && /^(---|\.\.\.)\s*$/.test(lines[line]))
        frontmatter = false;
      continue;
    }
    if (
      !known.has(line) &&
      !excluded.has(line) &&
      /^\s*(?:>\s*)*\d+[.)]\s+/.test(lines[line])
    ) {
      raw.push({ line, end: line, parentLine: null });
    }
  }
  raw.sort((a, b) => a.line - b.line);
  const nodes: ListNode[] = [];
  const byLine = new Map<number, number>();
  let block = -1,
    cluster = -1;
  let previousRootEnd = -2;
  let lastRoot: ListNode | undefined;
  for (const row of raw) {
    if (excluded.has(row.line)) continue;
    const match = lines[row.line].match(
      /^\s*(?:>\s*)*([-+*]|\d+[.)])\s+(?:\[([^\]])\]\s*)?(.*)$/,
    );
    if (!match) continue;
    let parent =
      row.parentLine === null ? null : (byLine.get(row.parentLine) ?? null);
    if (parent === null) {
      const between = lines.slice(previousRootEnd + 1, row.line);
      const onlyBlank = between.every((line) => line.trim() === "");
      const separated =
        lastRoot === undefined ||
        between.length > 0 ||
        (lastRoot.kind === "ordered") !== /\d/.test(match[1]);
      if (separated) block++;
      if (lastRoot === undefined || !onlyBlank) cluster++;
      const before = lines[row.line - 1]?.trim() ?? "";
      if (
        separated &&
        before &&
        !excluded.has(row.line - 1) &&
        isUnmarkedListHead(before)
      ) {
        const head: ListNode = {
          index: nodes.length,
          line: row.line - 1,
          endLine: row.line - 1,
          text: before.replace(/^>\s*/, ""),
          marker: "",
          kind: "head",
          parent: null,
          depth: 0,
          block,
          cluster,
        };
        nodes.push(head);
        parent = head.index;
      } else if (
        !separated &&
        lastRoot?.parent !== null &&
        lastRoot?.parent !== undefined &&
        nodes[lastRoot.parent].kind === "head"
      ) {
        parent = lastRoot.parent;
      }
      previousRootEnd = row.end;
    }
    const ancestor = parent === null ? undefined : nodes[parent];
    const item: ListNode = {
      index: nodes.length,
      line: row.line,
      endLine: row.end,
      text: match[3] || "(Empty list item)",
      marker:
        match[2] !== undefined
          ? match[2] === " "
            ? "☐"
            : "☑"
          : /\d/.test(match[1])
            ? match[1]
            : "•",
      kind:
        match[2] !== undefined
          ? "task"
          : /\d/.test(match[1])
            ? "ordered"
            : "unordered",
      parent,
      depth: ancestor ? ancestor.depth + 1 : 0,
      block: ancestor?.block ?? block,
      cluster: ancestor?.cluster ?? cluster,
    };
    nodes.push(item);
    byLine.set(row.line, item.index);
    if (row.parentLine === null) lastRoot = item;
  }
  return nodes;
}

export function isUnmarkedListHead(text: string): boolean {
  return !/^(?:#{1,12}\s|[-+*]\s|\d+[.)]\s|`{3,}|~{3,}|---+$|\*\*\*+$|!\[\[|<)/.test(
    text,
  );
}

export function listAncestors(
  nodes: readonly ListNode[],
  index: number,
): number[] {
  const result: number[] = [];
  let current: number | null = index;
  while (current !== null && nodes[current] && result.length <= nodes.length) {
    result.push(current);
    current = nodes[current].parent;
  }
  return result.reverse();
}

export function listNodeAtLine(
  nodes: readonly ListNode[],
  line: number,
): number | null {
  let found: number | null = null;
  for (const node of nodes) {
    if (node.line > line) break;
    if (node.endLine >= line) found = node.index;
  }
  return found;
}

export interface ListThreadOptions {
  enabled: boolean;
  active: boolean;
  all: boolean;
  unmarked: boolean;
  orphan: boolean;
  orphanActive: boolean;
  orphanAll: boolean;
  joinActive: boolean;
  joinAll: boolean;
}

export function listThreadPlan(
  nodes: readonly ListNode[],
  active: number | null,
  options: ListThreadOptions,
): number[] {
  const node = active === null ? undefined : nodes[active];
  if (!node || !options.enabled) return [];
  const head = nodes.find((n) => n.block === node.block && n.kind === "head");
  const orphan = head === undefined;
  const all = orphan ? options.orphan && options.orphanAll : options.all;
  if (
    !all &&
    !(orphan ? options.orphan && options.orphanActive : options.active)
  )
    return [];
  const join = all ? options.joinAll : options.joinActive;
  const group = nodes.filter((n) =>
    join ? n.cluster === node.cluster : n.block === node.block,
  );
  const selected = new Set(
    all ? group.map((n) => n.index) : listAncestors(nodes, node.index),
  );
  return [...selected]
    .filter(
      (i) =>
        nodes[i].kind !== "head" &&
        ((nodes[i].parent !== null && nodes[nodes[i].parent].kind !== "head") ||
          orphan ||
          options.unmarked),
    )
    .sort((a, b) => a - b);
}

export function breadcrumbEntries(
  nodes: readonly ListNode[],
  current: number,
  options: ListThreadOptions,
): number[] {
  const result = new Set(listAncestors(nodes, current));
  for (const index of listThreadPlan(nodes, current, options)) {
    for (const ancestor of listAncestors(nodes, index)) result.add(ancestor);
  }
  // Thread visibility must not remove the structural head from the breadcrumb.
  return [...result].sort((a, b) => a - b);
}
