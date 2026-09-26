// Minimal host adapter for browser fixtures. These tests do not run Obsidian.
import { listLabel } from "../../src/list-label.ts";
export class MarkdownView {}
export class Component {
  children = [];
  callbacks = [];
  loaded = false;
  load() { this.loaded = true; this.onload?.(); this.children.forEach(c => c.load()); }
  unload() {
    if (!this.loaded) return;
    this.loaded = false;
    this.children.splice(0).forEach(c => c.unload());
    this.callbacks.splice(0).forEach(fn => fn());
    this.onunload?.();
  }
  addChild(child) { this.children.push(child); if (this.loaded) child.load(); return child; }
  removeChild(child) { child.unload(); this.children = this.children.filter(c => c !== child); return child; }
  register(fn) { this.callbacks.push(fn); }
}
export class MarkdownRenderer {
  static async render(app, source, el, file, component) {
    if (globalThis.ltigRenderMarkdown) return globalThis.ltigRenderMarkdown(app, source, el, file, component);
    // Existing geometry fixtures need label text only. Rich-content fixtures
    // inject host-shaped output and assert delegation/lifecycle, not typesetting.
    el.textContent = listLabel(source, entity => sanitizeHTMLToDom(entity).textContent);
  }
}
export function sanitizeHTMLToDom(html) {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  for (const el of body.querySelectorAll("script, iframe, object, embed")) el.remove();
  for (const el of body.querySelectorAll("*")) for (const attr of el.attributes) {
    if (/^on/i.test(attr.name) || /^javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
  }
  const fragment = document.createDocumentFragment();
  fragment.append(...body.childNodes);
  return fragment;
}
function create(tag, options = {}, svg = false) {
  if (typeof options === "string") options = { cls: options };
  const doc = this.ownerDocument ?? document;
  const el = svg
    ? doc.createElementNS("http://www.w3.org/2000/svg", tag)
    : doc.createElement(tag);
  if (options.type) el.setAttribute("type", options.type);
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
