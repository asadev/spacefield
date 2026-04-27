"use client";

/* ═══════════════════════════════════════════════════════════════════════════
   Serializers for the Documents app
   ───────────────────────────────────────────────────────────────────────────
   Two jobs:
     1. ProseMirror JSON  → Markdown   (used as the default save format)
     2. TipTap HTML       → .docx blob (used for "Save as .docx" download)

   Both are intentionally hand-rolled and conservative. We don't pull in a
   full markdown AST or an HTML→DOCX transformer because the round-trip
   surface is small (TipTap StarterKit + tables/links/images/tasks) and the
   alternatives ship megabytes of code we'd never use.
═══════════════════════════════════════════════════════════════════════════ */

// ---------------------------------------------------------------------------
// ProseMirror JSON → Markdown
// ---------------------------------------------------------------------------

interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

function escapeMarkdownText(s: string): string {
  // Escape characters that would otherwise be interpreted as markdown.
  return s.replace(/([\\`*_{}[\]()#+!|])/g, "\\$1");
}

function applyMarks(text: string, marks: PMNode["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  // Order matters — code wraps after escaping for everything else.
  const has = (n: string) => marks.some((m) => m.type === n);
  const linkMark = marks.find((m) => m.type === "link");
  if (has("code")) {
    // Inside code, don't escape markdown — but undo any escaping the caller
    // did, since backticks survive on their own.
    out = text.replace(/\\([\\`*_{}[\]()#+!|])/g, "$1");
    out = `\`${out}\``;
    return out;
  }
  if (has("bold") && has("italic")) out = `***${out}***`;
  else if (has("bold")) out = `**${out}**`;
  else if (has("italic")) out = `*${out}*`;
  if (has("strike")) out = `~~${out}~~`;
  if (has("underline")) out = `<u>${out}</u>`;
  if (linkMark) {
    const href = (linkMark.attrs?.href as string) ?? "";
    out = `[${out}](${href})`;
  }
  return out;
}

function renderInline(content: PMNode[] | undefined): string {
  if (!content) return "";
  let out = "";
  for (const node of content) {
    if (node.type === "text") {
      const escaped = escapeMarkdownText(node.text ?? "");
      out += applyMarks(escaped, node.marks);
    } else if (node.type === "hardBreak") {
      out += "  \n";
    } else if (node.type === "image") {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      out += `![${alt}](${src})`;
    } else if (node.content) {
      // Treat any nested node we don't specifically recognise as inline.
      out += renderInline(node.content);
    }
  }
  return out;
}

function renderListItems(
  node: PMNode,
  ordered: boolean,
  depth: number
): string {
  const items = node.content ?? [];
  let out = "";
  items.forEach((item, idx) => {
    const marker = ordered ? `${idx + 1}.` : "-";
    const indent = "  ".repeat(depth);
    const itemContent = item.content ?? [];
    // Render the item's first paragraph inline; subsequent paragraphs and
    // nested lists become indented continuations.
    let firstWritten = false;
    for (const child of itemContent) {
      if (child.type === "paragraph") {
        const inline = renderInline(child.content);
        if (!firstWritten) {
          out += `${indent}${marker} ${inline}\n`;
          firstWritten = true;
        } else {
          out += `${indent}  ${inline}\n`;
        }
      } else if (child.type === "bulletList") {
        out += renderListItems(child, false, depth + 1);
      } else if (child.type === "orderedList") {
        out += renderListItems(child, true, depth + 1);
      } else if (child.type === "taskList") {
        out += renderTaskItems(child, depth + 1);
      } else {
        out += `${indent}  ${renderInline(child.content)}\n`;
      }
    }
    if (!firstWritten) {
      // Empty list item — emit at least the bullet so the structure survives.
      out += `${indent}${marker} \n`;
    }
  });
  return out;
}

function renderTaskItems(node: PMNode, depth: number): string {
  const items = node.content ?? [];
  let out = "";
  for (const item of items) {
    const checked = item.attrs?.checked === true;
    const indent = "  ".repeat(depth);
    const itemContent = item.content ?? [];
    let firstWritten = false;
    for (const child of itemContent) {
      if (child.type === "paragraph") {
        const inline = renderInline(child.content);
        if (!firstWritten) {
          out += `${indent}- [${checked ? "x" : " "}] ${inline}\n`;
          firstWritten = true;
        } else {
          out += `${indent}  ${inline}\n`;
        }
      } else if (child.type === "taskList") {
        out += renderTaskItems(child, depth + 1);
      } else if (child.type === "bulletList") {
        out += renderListItems(child, false, depth + 1);
      } else if (child.type === "orderedList") {
        out += renderListItems(child, true, depth + 1);
      } else {
        out += `${indent}  ${renderInline(child.content)}\n`;
      }
    }
    if (!firstWritten) {
      out += `${indent}- [${checked ? "x" : " "}] \n`;
    }
  }
  return out;
}

function renderTable(node: PMNode): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";
  const cellTexts: string[][] = rows.map((row) => {
    const cells = row.content ?? [];
    return cells.map((cell) => {
      // A cell is itself a sequence of block nodes — render their inline text.
      const inner = (cell.content ?? [])
        .map((child) => renderInline(child.content))
        .join(" ");
      return inner.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
    });
  });
  const cols = Math.max(...cellTexts.map((r) => r.length));
  const norm = cellTexts.map((r) => {
    const padded = [...r];
    while (padded.length < cols) padded.push("");
    return padded;
  });
  // Treat the first row as the header — TipTap's default table includes a
  // header row when inserted via the toolbar.
  const header = norm[0];
  const body = norm.slice(1);
  const sep = header.map(() => "---");
  let out = `| ${header.join(" | ")} |\n`;
  out += `| ${sep.join(" | ")} |\n`;
  for (const r of body) {
    out += `| ${r.join(" | ")} |\n`;
  }
  out += "\n";
  return out;
}

function renderBlock(node: PMNode): string {
  switch (node.type) {
    case "doc":
      return (node.content ?? []).map(renderBlock).join("");
    case "paragraph": {
      const inline = renderInline(node.content);
      return inline.length === 0 ? "\n" : `${inline}\n\n`;
    }
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      const hashes = "#".repeat(Math.min(6, Math.max(1, level)));
      return `${hashes} ${renderInline(node.content)}\n\n`;
    }
    case "bulletList":
      return `${renderListItems(node, false, 0)}\n`;
    case "orderedList":
      return `${renderListItems(node, true, 0)}\n`;
    case "taskList":
      return `${renderTaskItems(node, 0)}\n`;
    case "blockquote": {
      const inner = (node.content ?? []).map(renderBlock).join("").trimEnd();
      const quoted = inner
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
      return `${quoted}\n\n`;
    }
    case "codeBlock": {
      const lang = (node.attrs?.language as string | undefined) ?? "";
      const text = (node.content ?? [])
        .map((c) => c.text ?? "")
        .join("");
      return `\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    }
    case "horizontalRule":
      return `---\n\n`;
    case "table":
      return renderTable(node);
    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})\n\n`;
    }
    default:
      // Fallback — emit inline content if any.
      if (node.content) {
        const inner = (node.content ?? []).map(renderBlock).join("");
        if (inner) return inner;
        return `${renderInline(node.content)}\n\n`;
      }
      return "";
  }
}

export function docToMarkdown(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const out = renderBlock(json as PMNode);
  // Collapse runs of 3+ blank lines to keep the file tidy.
  return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// HTML → DOCX
// ---------------------------------------------------------------------------

/* HTML → docx tree. We walk the editor's HTML output (TipTap's getHTML())
 * and translate each block into a `Paragraph` or `Table` from the `docx`
 * lib. Inline marks (bold/italic/underline/strike/code/link) become
 * `TextRun` formatting.
 *
 * The mapping is intentionally narrow — the same set of nodes we emit in
 * the markdown serializer. Anything we don't recognise gets dropped to a
 * plain paragraph so the user doesn't lose their text.
 */

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: string;
}

export async function htmlToDocxBlob(html: string): Promise<Blob> {
  const docx = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    AlignmentType,
    ExternalHyperlink,
  } = docx;

  const parser = new DOMParser();
  const dom = parser.parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html"
  );
  const body = dom.body;

  // Translate inline HTML nodes into an array of TextRun / hyperlink runs.
  function buildInline(
    nodes: NodeList | Node[],
    base: RunStyle = {}
  ): Array<InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>> {
    const out: Array<
      InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>
    > = [];
    nodes.forEach((node) => {
      if (node.nodeType === 3) {
        // Text node
        const text = (node.textContent ?? "").replace(/ /g, " ");
        if (text.length === 0) return;
        out.push(
          new TextRun({
            text,
            bold: base.bold,
            italics: base.italic,
            underline: base.underline ? {} : undefined,
            strike: base.strike,
            font: base.code ? "Courier New" : undefined,
          })
        );
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const next: RunStyle = { ...base };
      if (tag === "br") {
        out.push(new TextRun({ text: "", break: 1 }));
        return;
      }
      if (tag === "strong" || tag === "b") next.bold = true;
      if (tag === "em" || tag === "i") next.italic = true;
      if (tag === "u") next.underline = true;
      if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
      if (tag === "code") next.code = true;
      if (tag === "a") {
        const href = el.getAttribute("href") ?? "";
        const inner = buildInline(el.childNodes, next);
        const runs = inner.filter(
          (r): r is InstanceType<typeof TextRun> => r instanceof TextRun
        );
        if (href && runs.length > 0) {
          out.push(
            new ExternalHyperlink({
              link: href,
              children: runs,
            })
          );
          return;
        }
      }
      const children = buildInline(el.childNodes, next);
      out.push(...children);
    });
    return out;
  }

  function buildParagraph(
    el: HTMLElement,
    extra: { heading?: keyof typeof HeadingLevel; bullet?: { level: number }; numbered?: { level: number } } = {}
  ): InstanceType<typeof Paragraph> {
    const runs = buildInline(el.childNodes);
    const onlyTextRuns = runs.filter(
      (r): r is InstanceType<typeof TextRun> => r instanceof TextRun
    );
    const otherRuns = runs.filter(
      (r) => !(r instanceof TextRun)
    );
    return new Paragraph({
      heading: extra.heading ? HeadingLevel[extra.heading] : undefined,
      bullet: extra.bullet,
      numbering: extra.numbered
        ? { reference: "doc-numbered", level: extra.numbered.level }
        : undefined,
      children: [...onlyTextRuns, ...otherRuns],
    });
  }

  function processList(
    el: HTMLElement,
    ordered: boolean,
    level: number,
    out: Array<InstanceType<typeof Paragraph>>
  ) {
    const items = Array.from(el.children).filter(
      (c) => c.tagName.toLowerCase() === "li"
    ) as HTMLElement[];
    items.forEach((li) => {
      // Build a paragraph for the item's direct text + inline children, then
      // recurse for any nested lists.
      const inlineNodes: Node[] = [];
      const nestedLists: HTMLElement[] = [];
      Array.from(li.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = (child as HTMLElement).tagName.toLowerCase();
          if (tag === "ul" || tag === "ol") {
            nestedLists.push(child as HTMLElement);
            return;
          }
        }
        inlineNodes.push(child);
      });
      const wrap = dom.createElement("p");
      inlineNodes.forEach((n) => wrap.appendChild(n.cloneNode(true)));
      out.push(
        buildParagraph(wrap, ordered
          ? { numbered: { level } }
          : { bullet: { level } })
      );
      nestedLists.forEach((nested) => {
        const tag = nested.tagName.toLowerCase();
        processList(nested, tag === "ol", level + 1, out);
      });
    });
  }

  function processBlock(
    el: HTMLElement,
    out: Array<
      | InstanceType<typeof Paragraph>
      | InstanceType<typeof Table>
    >
  ) {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "h1":
        out.push(buildParagraph(el, { heading: "HEADING_1" }));
        return;
      case "h2":
        out.push(buildParagraph(el, { heading: "HEADING_2" }));
        return;
      case "h3":
        out.push(buildParagraph(el, { heading: "HEADING_3" }));
        return;
      case "h4":
      case "h5":
      case "h6":
        out.push(buildParagraph(el, { heading: "HEADING_4" }));
        return;
      case "p":
        out.push(buildParagraph(el));
        return;
      case "blockquote": {
        const para = new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 360 },
          children: buildInline(el.childNodes).filter(
            (r): r is InstanceType<typeof TextRun> => r instanceof TextRun
          ),
        });
        out.push(para);
        return;
      }
      case "pre": {
        const text = (el.textContent ?? "").replace(/ /g, " ");
        text.split(/\r?\n/).forEach((line) => {
          out.push(
            new Paragraph({
              children: [
                new TextRun({ text: line, font: "Courier New" }),
              ],
            })
          );
        });
        return;
      }
      case "ul":
        processList(el, false, 0, out as Array<InstanceType<typeof Paragraph>>);
        return;
      case "ol":
        processList(el, true, 0, out as Array<InstanceType<typeof Paragraph>>);
        return;
      case "hr":
        out.push(
          new Paragraph({
            children: [
              new TextRun({ text: "—".repeat(20) }),
            ],
          })
        );
        return;
      case "table": {
        const rowEls = Array.from(el.querySelectorAll("tr"));
        const rows = rowEls.map((tr) => {
          const cellEls = Array.from(tr.querySelectorAll("th,td"));
          const cells = cellEls.map((cell) => {
            const para = new Paragraph({
              children: buildInline(cell.childNodes).filter(
                (r): r is InstanceType<typeof TextRun> => r instanceof TextRun
              ),
            });
            return new TableCell({ children: [para] });
          });
          return new TableRow({ children: cells });
        });
        if (rows.length > 0) {
          out.push(new Table({ rows }));
        }
        return;
      }
      case "img": {
        const alt = el.getAttribute("alt") ?? "";
        out.push(
          new Paragraph({
            children: [new TextRun({ text: alt || "[image]", italics: true })],
          })
        );
        return;
      }
      default:
        // Fallback — treat as paragraph of inline content.
        out.push(buildParagraph(el));
    }
  }

  const sections: Array<
    InstanceType<typeof Paragraph> | InstanceType<typeof Table>
  > = [];
  Array.from(body.children).forEach((node) => {
    processBlock(node as HTMLElement, sections);
  });
  if (sections.length === 0) {
    sections.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
  }

  const docInstance = new Document({
    numbering: {
      config: [
        {
          reference: "doc-numbered",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
            {
              level: 1,
              format: "decimal",
              text: "%2.",
              alignment: AlignmentType.LEFT,
            },
            {
              level: 2,
              format: "decimal",
              text: "%3.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: sections,
      },
    ],
  });

  const blob = await Packer.toBlob(docInstance);
  return blob;
}
