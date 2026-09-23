// Minimal host adapter for browser fixtures. These tests do not run Obsidian.
export class MarkdownView {}
// Only entity tokens are passed by the label projection; never source HTML.
export function sanitizeHTMLToDom(entity) {
  if (!/^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);$/i.test(entity)) throw new Error("Expected an entity token");
  return new DOMParser().parseFromString(entity, "text/html").body;
}
function create(tag, options = {}, svg = false) {
  if (typeof options === "string") options = { cls: options };
  const doc = this.ownerDocument ?? document;
  const el = svg
    ? doc.createElementNS("http://www.w3.org/2000/svg", tag)
    : doc.createElement(tag);
  // Obsidian 1.13.7 enhance.js uses DOMTokenList.add for SVG, unlike HTML.
  // A space-delimited SVG class string is ONE invalid token at runtime.
  if (options.cls && svg) el.classList.add(...(Array.isArray(options.cls) ? options.cls : [options.cls]));
  else if (options.cls)
    el.setAttribute(
      "class",
      Array.isArray(options.cls) ? options.cls.join(" ") : options.cls,
    );
  if (options.text) el.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {}))
    el.setAttribute(key, value);
  if (options.prepend) this.prepend(el);
  else this.append(el);
  return el;
}
for (const proto of [
  HTMLElement.prototype,
  SVGElement.prototype,
  DocumentFragment.prototype,
]) {
  proto.createEl = function (tag, options) {
    return create.call(this, tag, options);
  };
  proto.createDiv = function (options) {
    return create.call(this, "div", options);
  };
  proto.createSpan = function (options) {
    return create.call(this, "span", options);
  };
  proto.createSvg = function (tag, options) {
    return create.call(this, tag, options, true);
  };
}
globalThis.createFragment = () => document.createDocumentFragment();
