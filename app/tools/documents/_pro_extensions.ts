"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Pro extensions for the Documents app
   ───────────────────────────────────────────────────────────────────────────
   Two custom TipTap pieces live here:

     1. CommentMark — an inline mark with a `commentId` attribute. Storage
        keeps a flat map of {id → {author, text, createdAt}} that round-trips
        through save/load via HTML comment markers.

     2. createSlashSuggestion() — a Suggestion plugin instance the editor
        loads. It owns the React popover via the host's onSlashOpen / Close
        / Update / Select callbacks. Keeping the UI out of this file lets
        the popover lazy-load.
═══════════════════════════════════════════════════════════════════════════ */

import {
  Mark,
  mergeAttributes,
  type Editor,
  type Range,
} from "@tiptap/core";
import {
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";

// ---------------------------------------------------------------------------
// Comment mark — inline, anchored by commentId. Only the id rides in the
// document; the full payload (author/text/createdAt) lives in editor
// storage so it stays editable without diffing the doc tree.
// ---------------------------------------------------------------------------

export interface CommentRecord {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: (commentId?: string) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) =>
          attrs.commentId
            ? { "data-comment-id": attrs.commentId as string }
            : {},
      },
    };
  },

  addStorage() {
    return { records: new Map<string, CommentRecord>() };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "doc-comment",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetComment:
        (commentId?: string) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection;
          if (!commentId) {
            tr.removeMark(from, to, state.schema.marks[this.name]);
            if (dispatch) dispatch(tr);
            return true;
          }
          state.doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (
                mark.type.name === "comment" &&
                mark.attrs.commentId === commentId
              ) {
                tr.removeMark(
                  pos,
                  pos + node.nodeSize,
                  state.schema.marks[this.name]
                );
              }
            });
            return true;
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

// ---------------------------------------------------------------------------
// Slash menu — Suggestion plugin wired to host-supplied callbacks. The host
// (Documents app) owns the rendered popover so it can be code-split.
// ---------------------------------------------------------------------------

export interface SlashItem {
  id: string;
  label: string;
  hint: string;
  group: "Blocks" | "Lists" | "Insert";
  keywords: string[];
  run: (args: { editor: Editor; range: Range }) => void;
}

export interface SlashHostHandlers {
  onOpen: (props: SuggestionProps<SlashItem>) => void;
  onUpdate: (props: SuggestionProps<SlashItem>) => void;
  onClose: () => void;
  onKeyDown: (ev: KeyboardEvent) => boolean;
  setHandler: (h: (ev: KeyboardEvent) => boolean) => void;
}

export function buildSlashItems(): SlashItem[] {
  return [
    {
      id: "p",
      label: "Paragraph",
      hint: "Plain text",
      group: "Blocks",
      keywords: ["p", "para", "text"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    ...[1, 2, 3, 4, 5, 6].map<SlashItem>((level) => ({
      id: `h${level}`,
      label: `Heading ${level}`,
      hint: `H${level}`,
      group: "Blocks",
      keywords: [`h${level}`, "heading", "title"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level })
          .run(),
    })),
    {
      id: "quote",
      label: "Quote",
      hint: "Block quote",
      group: "Blocks",
      keywords: ["quote", "blockquote"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
      id: "codeblock",
      label: "Code Block",
      hint: "Monospaced code",
      group: "Blocks",
      keywords: ["code", "codeblock", "pre"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    },
    {
      id: "ul",
      label: "Bullet List",
      hint: "Unordered list",
      group: "Lists",
      keywords: ["bullet", "ul", "list"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "ol",
      label: "Numbered List",
      hint: "Ordered list",
      group: "Lists",
      keywords: ["number", "ol", "ordered"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "task",
      label: "Task List",
      hint: "Checklist",
      group: "Lists",
      keywords: ["task", "todo", "checklist", "check"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      id: "table",
      label: "Insert Table",
      hint: "3 x 3",
      group: "Insert",
      keywords: ["table", "grid"],
      run: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: "image",
      label: "Insert Image",
      hint: "From URL",
      group: "Insert",
      keywords: ["image", "img", "picture"],
      run: ({ editor, range }) => {
        const url = window.prompt("Image URL", "https://");
        editor.chain().focus().deleteRange(range).run();
        if (url && url.length > 0) {
          editor.chain().focus().setImage({ src: url }).run();
        }
      },
    },
    {
      id: "hr",
      label: "Horizontal Rule",
      hint: "Divider",
      group: "Insert",
      keywords: ["hr", "rule", "divider", "line"],
      run: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
  ];
}

export function createSlashSuggestion(
  host: SlashHostHandlers
): Omit<SuggestionOptions<SlashItem>, "editor"> {
  return {
    char: "/",
    startOfLine: false,
    items: ({ query }) => {
      const all = buildSlashItems();
      const q = query.toLowerCase().trim();
      if (!q) return all;
      return all.filter((it) => {
        if (it.label.toLowerCase().includes(q)) return true;
        return it.keywords.some((k) => k.startsWith(q));
      });
    },
    command: ({ editor, range, props }) => {
      props.run({ editor, range });
    },
    render: () => {
      let lastProps: SuggestionProps<SlashItem> | null = null;
      const handler = (ev: KeyboardEvent): boolean => {
        if (!lastProps) return false;
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          // Selection state is managed inside the popover; we just signal.
          return host.onKeyDown(ev);
        }
        if (ev.key === "Enter" || ev.key === "Tab") {
          return host.onKeyDown(ev);
        }
        if (ev.key === "Escape") {
          return host.onKeyDown(ev);
        }
        return false;
      };
      return {
        onStart: (props) => {
          lastProps = props;
          host.setHandler(handler);
          host.onOpen(props);
        },
        onUpdate: (props) => {
          lastProps = props;
          host.onUpdate(props);
        },
        onKeyDown: (props) => handler(props.event),
        onExit: () => {
          lastProps = null;
          host.onClose();
        },
      };
    },
  };
}
