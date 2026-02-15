import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type CalloutTone = "tip" | "note" | "warning" | "success";

const DEFAULT_TONE: CalloutTone = "tip";
const DEFAULT_EMOJI = "💡";

function normalizeTone(value: unknown): CalloutTone {
  if (value === "note" || value === "warning" || value === "success") return value;
  return DEFAULT_TONE;
}

function normalizeEmoji(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export const CalloutBlock = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      tone: {
        default: DEFAULT_TONE,
        parseHTML: (element: HTMLElement) => normalizeTone(element.getAttribute("data-tone")),
        renderHTML: (attrs: { tone?: unknown }) => ({ "data-tone": normalizeTone(attrs?.tone) }),
      },
      emoji: {
        default: DEFAULT_EMOJI,
        parseHTML: (element: HTMLElement) => {
          const fromAttr = normalizeEmoji(element.getAttribute("data-emoji"));
          if (fromAttr) return fromAttr;
          const fromNode = normalizeEmoji(element.querySelector("[data-callout-emoji]")?.textContent);
          return fromNode || DEFAULT_EMOJI;
        },
        renderHTML: (attrs: { emoji?: unknown }) => {
          const emoji = normalizeEmoji(attrs?.emoji);
          if (!emoji) return {};
          return { "data-emoji": emoji };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = HTMLAttributes as Record<string, unknown>;
    const tone = normalizeTone(attrs.tone);
    const emoji = normalizeEmoji(attrs.emoji);

    return [
      "div",
      mergeAttributes(
        {
          "data-type": "callout",
          "data-tone": tone,
          ...(emoji ? { "data-emoji": emoji } : {}),
        },
        attrs,
      ),
      ["span", { "data-callout-emoji": "true" }, emoji],
      ["div", { "data-callout-content": "true" }, 0],
    ];
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      let currentNode = node;

      const dom = document.createElement("div");
      dom.className = "editor-callout-block";
      dom.dataset.type = "callout";
      dom.draggable = editor.isEditable;
      if (!editor.isEditable) {
        dom.classList.add("is-readonly");
      }

      const emojiButton = document.createElement("button");
      emojiButton.type = "button";
      emojiButton.className = "editor-callout-emoji";
      emojiButton.setAttribute("data-callout-emoji", "true");
      emojiButton.setAttribute("contenteditable", "false");
      emojiButton.tabIndex = -1;

      const contentDOM = document.createElement("div");
      contentDOM.className = "editor-callout-content";
      contentDOM.setAttribute("data-callout-content", "true");

      dom.append(emojiButton, contentDOM);

      const resolvePos = (): number | null => {
        if (typeof getPos !== "function") return null;
        const resolved = getPos();
        return typeof resolved === "number" ? resolved : null;
      };

      const syncView = () => {
        const tone = normalizeTone(currentNode.attrs.tone);
        const emoji = normalizeEmoji(currentNode.attrs.emoji);

        dom.dataset.tone = tone;
        dom.classList.toggle("is-no-emoji", !emoji);

        if (emoji) {
          emojiButton.textContent = emoji;
          emojiButton.style.display = "inline-flex";
        } else {
          emojiButton.textContent = "";
          emojiButton.style.display = "none";
        }
      };

      syncView();

      if (editor.isEditable) {
        emojiButton.addEventListener("mousedown", (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
        });

        emojiButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const currentEmoji = normalizeEmoji(currentNode.attrs.emoji);
          const nextEmojiRaw = window.prompt("Callout emoji (optional)", currentEmoji);
          if (nextEmojiRaw === null) return;

          const pos = resolvePos();
          if (pos === null) return;

          const nextEmoji = normalizeEmoji(nextEmojiRaw);
          const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            emoji: nextEmoji,
          });

          editor.view.dispatch(tr);
          editor.view.focus();
        });
      }

      return {
        dom,
        contentDOM,
        update(updatedNode: ProseMirrorNode) {
          if (updatedNode.type.name !== currentNode.type.name) return false;
          currentNode = updatedNode;
          syncView();
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
