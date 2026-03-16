import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { NodeSelection } from "@tiptap/pm/state";

type DividerSpacing = "compact" | "normal" | "relaxed";

function normalizeSpacing(value: unknown): DividerSpacing {
  if (value === "compact" || value === "relaxed") return value;
  return "normal";
}

export const DividerBlock = HorizontalRule.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      spacing: {
        default: "normal",
        parseHTML: (element: HTMLElement) => normalizeSpacing(element.getAttribute("data-spacing")),
        renderHTML: (attrs: { spacing?: string }) => {
          const spacing = normalizeSpacing(attrs?.spacing);
          if (spacing === "normal") return {};
          return { "data-spacing": spacing };
        },
      },
    };
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      let currentNode = node;

      const dom = document.createElement("div");
      dom.className = "editor-divider-block";
      dom.setAttribute("contenteditable", "false");
      dom.setAttribute("data-drag-handle", "");
      dom.dataset.spacing = normalizeSpacing(currentNode.attrs.spacing);
      dom.draggable = editor.isEditable;
      if (!editor.isEditable) {
        dom.classList.add("is-readonly");
      }

      const resolvePos = (): number | null => {
        if (typeof getPos !== "function") return null;
        const resolved = getPos();
        return typeof resolved === "number" ? resolved : null;
      };

      const selectDividerNode = () => {
        const pos = resolvePos();
        if (pos === null) return;
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos));
        editor.view.dispatch(tr.scrollIntoView());
        editor.view.focus();
      };

      const line = document.createElement("hr");
      line.className = "editor-divider-line";

      dom.append(line);

      const syncSpacingState = () => {
        const spacing = normalizeSpacing(currentNode.attrs.spacing);
        dom.dataset.spacing = spacing;
      };

      syncSpacingState();

      if (editor.isEditable) {
        dom.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          selectDividerNode();
        });

        dom.addEventListener("dragstart", () => {
          selectDividerNode();
        });
      }

      return {
        dom,
        update(updatedNode: any) {
          if (updatedNode.type.name !== currentNode.type.name) return false;
          currentNode = updatedNode;
          syncSpacingState();
          return true;
        },
        selectNode() {
          dom.classList.add("is-selected");
        },
        deselectNode() {
          dom.classList.remove("is-selected");
        },
      };
    };
  },
});
