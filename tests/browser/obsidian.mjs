// Minimal host adapter for browser fixtures. These tests do not run Obsidian.
export class MarkdownView {}
function create(tag, options = {}, svg = false) {
  if (typeof options === "string") options = { cls: options };
  const doc = this.ownerDocument ?? document;
  const el = svg
    ? doc.createElementNS("http://www.w3.org/2000/svg", tag)
    : doc.createElement(tag);
  if (options.cls)
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
