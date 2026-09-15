import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export const listBreadcrumbHighlight = StateEffect.define<number | null>();
const highlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects)
      if (effect.is(listBreadcrumbHighlight)) {
        const line = effect.value;
        value =
          line !== null && line >= 0 && line < transaction.state.doc.lines
            ? Decoration.set([
                Decoration.line({
                  class: "ltig-breadcrumb-main-highlight",
                }).range(transaction.state.doc.line(line + 1).from),
              ])
            : Decoration.none;
      }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
export interface BreadcrumbEditorHost {
  addEditor(view: EditorView): void;
  updateEditor(update: ViewUpdate): void;
  removeEditor(view: EditorView): void;
}
export function createBreadcrumbEditorExtension(host: BreadcrumbEditorHost) {
  return [
    highlight,
    ViewPlugin.fromClass(
      class {
        constructor(private readonly view: EditorView) {
          host.addEditor(view);
        }
        update(update: ViewUpdate) {
          host.updateEditor(update);
        }
        destroy() {
          host.removeEditor(this.view);
        }
      },
    ),
  ];
}
