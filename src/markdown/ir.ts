import MarkdownIt from "markdown-it";
import type { MarkdownTableMode } from "../config/types.base.js";
import { chunkText } from "../auto-reply/chunk.js";

type ListState = {
  type: "bullet" | "ordered";
  index: number;
};

type LinkState = {
  href: string;
  labelStart: number;
};

type RenderEnv = {
  listStack: ListState[];
};

type MarkdownToken = {
  type: string;
  content?: string;
  children?: MarkdownToken[];
  attrs?: [string, string][];
  attrGet?: (name: string) => string | null;
};

function getTokenChildren(token: MarkdownToken): MarkdownToken[] {
  return token.children ?? [];
}

export type MarkdownStyle = "bold" | "italic" | "strikethrough" | "code" | "code_block" | "spoiler";

export type MarkdownStyleSpan = {
  start: number;
  end: number;
  style: MarkdownStyle;
};

export type MarkdownLinkSpan = {
  start: number;
  end: number;
  href: string;
};

export type MarkdownIR = {
  text: string;
  styles: MarkdownStyleSpan[];
  links: MarkdownLinkSpan[];
};

type OpenStyle = {
  style: MarkdownStyle;
  start: number;
};

type RenderTarget = {
  text: string;
  styles: MarkdownStyleSpan[];
  openStyles: OpenStyle[];
  links: MarkdownLinkSpan[];
  linkStack: LinkState[];
};

type TableCell = {
  text: string;
  styles: MarkdownStyleSpan[];
  links: MarkdownLinkSpan[];
};

type TableState = {
  headers: TableCell[];
  rows: TableCell[][];
  currentRow: TableCell[];
  currentCell: RenderTarget | null;
  inHeader: boolean;
};

type RenderState = RenderTarget & {
  env: RenderEnv;
  headingStyle: "none" | "bold";
  blockquotePrefix: string;
  enableSpoilers: boolean;
  tableMode: MarkdownTableMode;
  table: TableState | null;
  hasTables: boolean;
};

export type MarkdownParseOptions = {
  linkify?: boolean;
  enableSpoilers?: boolean;
  headingStyle?: "none" | "bold";
  blockquotePrefix?: string;
  autolink?: boolean;
  /** How to render tables (off|bullets|code). Default: off. */
  tableMode?: MarkdownTableMode;
};

function createMarkdownIt(options: MarkdownParseOptions): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: options.linkify ?? true,
    breaks: false,
    typographer: false,
  });
  md.enable("strikethrough");
  if (options.tableMode && options.tableMode !== "off") {
    md.enable("table");
  } else {
    md.disable("table");
  }
  if (options.autolink === false) {
    md.disable("autolink");
  }
  return md;
}

function getAttr(token: MarkdownToken, name: string): string | null {
  if (token.attrGet) {
    return token.attrGet(name);
  }
  if (token.attrs) {
    for (const [key, value] of token.attrs) {
      if (key === name) {
        return value;
      }
    }
  }
  return null;
}

function createTextToken(base: MarkdownToken, content: string): MarkdownToken {
  return { ...base, type: "text", content, children: undefined };
}

function applySpoilerTokens(tokens: MarkdownToken[]): void {
  for (const token of tokens) {
    if (token.children && token.children.length > 0) {
      token.children = injectSpoilersIntoInline(token.children);
    }
  }
}

function injectSpoilersIntoInline(tokens: MarkdownToken[]): MarkdownToken[] {
  const result: MarkdownToken[] = [];
  const state = { spoilerOpen: false };

  for (const token of tokens) {
    if (token.type !== "text") {
      result.push(token);
      continue;
    }

    const content = token.content ?? "";
    if (!content.includes("||")) {
      result.push(token);
      continue;
    }

    let index = 0;
    while (index < content.length) {
      const next = content.indexOf("||", index);
      if (next === -1) {
        if (index < content.length) {
          result.push(createTextToken(token, content.slice(index)));
        }
        break;
      }
      if (next > index) {
        result.push(createTextToken(token, content.slice(index, next)));
      }
      state.spoilerOpen = !state.spoilerOpen;
      result.push({
        type: state.spoilerOpen ? "spoiler_open" : "spoiler_close",
      });
      index = next + 2;
    }
  }

  return result;
}

function initRenderTarget(): RenderTarget {
  return {
    text: "",
    styles: [],
    openStyles: [],
    links: [],
    linkStack: [],
  };
}

function resolveRenderTarget(state: RenderState): RenderTarget {
  return state.table?.currentCell ?? state;
}

function appendText(state: RenderState, value: string) {
  if (!value) {
    return;
  }
  const target = resolveRenderTarget(state);
  target.text += value;
}

function openStyle(state: RenderState, style: MarkdownStyle) {
  const target = resolveRenderTarget(state);
  target.openStyles.push({ style, start: target.text.length });
}

function closeStyle(state: RenderState, style: MarkdownStyle) {
  const target = resolveRenderTarget(state);
  for (let i = target.openStyles.length - 1; i >= 0; i -= 1) {
    if (target.openStyles[i]?.style === style) {
      const start = target.openStyles[i].start;
      target.openStyles.splice(i, 1);
      const end = target.text.length;
      if (end > start) {
        target.styles.push({ start, end, style });
      }
      return;
    }
  }
}

function appendParagraphSeparator(state: RenderState) {
  if (state.env.listStack.length > 0) {
    return;
  }
  if (state.table) {
    return;
  } // Don't add paragraph separators inside tables
  state.text += "\n\n";
}

function appendListPrefix(state: RenderState) {
  const stack = state.env.listStack;
  const top = stack[stack.length - 1];
  if (!top) {
    return;
  }
  top.index += 1;
  const indent = "  ".repeat(Math.max(0, stack.length - 1));
  const prefix = top.type === "ordered" ? `${top.index}. ` : "• ";
  state.text += `${indent}${prefix}`;
}

function renderInlineCode(state: RenderState, content: string) {
  if (!content) {
    return;
  }
  const target = resolveRenderTarget(state);
  const start = target.text.length;
  target.text += content;
  target.styles.push({ start, end: start + content.length, style: "code" });
}

function renderCodeBlock(state: RenderState, content: string) {
  let code = content ?? "";
  if (!code.endsWith("\n")) {
    code = `${code}\n`;
  }
  const target = resolveRenderTarget(state);
  const start = target.text.length;
  target.text += code;
  target.styles.push({ start, end: start + code.length, style: "code_block" });
  if (state.env.listStack.length === 0) {
    target.text += "\n";
  }
}

function handleLinkClose(state: RenderState) {
  const target = resolveRenderTarget(state);
  const link = target.linkStack.pop();
  if (!link?.href) {
    return;
  }
  const href = link.href.trim();
  if (!href) {
    return;
  }
  const start = link.labelStart;
  const end = target.text.length;
  if (end <= start) {
    target.links.push({ start, end, href });
    return;
  }
  target.links.push({ start, end, href });
}

function initTableState(): TableState {
  return {
    headers: [],
    rows: [],
    currentRow: [],
    currentCell: null,
    inHeader: false,
  };
}

function finishTableCell(cell: RenderTarget): TableCell {
  closeRemainingStyles(cell);
  return {
    text: cell.text,
    styles: cell.styles,
    links: cell.links,
  };
}

function trimCell(cell: TableCell): TableCell {
  const text = cell.text;
  let start = 0;
  let end = text.length;
  while (start < end && /\s/.test(text[start] ?? "")) {
    start += 1;
  }
  while (end > start && /\s/.test(text[end - 1] ?? "")) {
    end -= 1;
  }
  if (start === 0 && end === text.length) {
    return cell;
  }
  const trimmedText = text.slice(start, end);
  const trimmedLength = trimmedText.length;
  const trimmedStyles: MarkdownStyleSpan[] = [];
  for (const span of cell.styles) {
    const sliceStart = Math.max(0, span.start - start);
    const sliceEnd = Math.min(trimmedLength, span.end - start);
    if (sliceEnd > sliceStart) {
      trimmedStyles.push({ start: sliceStart, end: sliceEnd, style: span.style });
    }
  }
  const trimmedLinks: MarkdownLinkSpan[] = [];
  for (const span of cell.links) {
    const sliceStart = Math.max(0, span.start - start);
    const sliceEnd = Math.min(trimmedLength, span.end - start);
    if (sliceEnd > sliceStart) {
      trimmedLinks.push({ start: sliceStart, end: sliceEnd, href: span.href });
    }
  }
  return { text: trimmedText, styles: trimmedStyles, links: trimmedLinks };
}

function appendCell(state: RenderState, cell: TableCell) {
  if (!cell.text) {
    return;
  }
  const start = state.text.length;
  state.text += cell.text;
  for (const span of cell.styles) {
    state.styles.push({
      start: start + span.start,
      end: start + span.end,
      style: span.style,
    });
  }
  for (const link of cell.links) {
    state.links.push({
      start: start + link.start,
      end: start + link.end,
      href: link.href,
    });
  }
}

function renderTableAsBullets(state: RenderState) {
  if (!state.table) {
    return;
  }
  const headers = state.table.headers.map(trimCell);
  const rows = state.table.rows.map((row) => row.map(trimCell));

  // If no headers or rows, skip
  if (headers.length === 0 && rows.length === 0) {
    return;
  }

  // Determine if first column should be used as row labels
  // (common pattern: first column is category/feature name)
  const useFirstColAsLabel = headers.length > 1 && rows.length > 0;

  if (useFirstColAsLabel) {
    // Format: each row becomes a section with header as row[0], then key:value pairs
    for (const row of rows) {
      if (row.length === 0) {
        continue;
      }

      const rowLabel = row[0];
      if (rowLabel?.text) {
        const labelStart = state.text.length;
        appendCell(state, rowLabel);
        const labelEnd = state.text.length;
        if (labelEnd > labelStart) {
          state.styles.push({ start: labelStart, end: labelEnd, style: "bold" });
        }
        state.text += "\n";
      }

      // Add each column as a bullet point
      for (let i = 1; i < row.length; i++) {
        const header = headers[i];
        const value = row[i];
        if (!value?.text) {
          continue;
        }
        state.text += "• ";
        if (header?.text) {
          appendCell(state, header);
          state.text += ": ";
        } else {
          state.text += `Column ${i}: `;
        }
        appendCell(state, value);
        state.text += "\n";
      }
      state.text += "\n";
    }
  } else {
    // Simple table: just list headers and values
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        const header = headers[i];
        const value = row[i];
        if (!value?.text) {
          continue;
        }
        state.text += "• ";
        if (header?.text) {
          appendCell(state, header);
          state.text += ": ";
        }
        appendCell(state, value);
        state.text += "\n";
      }
      state.text += "\n";
    }
  }
}

function renderTableAsCode(state: RenderState) {
  if (!state.table) {
    return;
  }
  const headers = state.table.headers.map(trimCell);
  const rows = state.table.rows.map((row) => row.map(trimCell));

  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length));
  if (columnCount === 0) {
    return;
  }

  const widths = Array.from({ length: columnCount }, () => 0);
  const updateWidths = (cells: TableCell[]) => {
    for (let i = 0; i < columnCount; i += 1) {
      const cell = cells[i];
      const width = cell?.text.length ?? 0;
      if (widths[i] < width) {
        widths[i] = width;
      }
    }
  };
  updateWidths(headers);
  for (const row of rows) {
    updateWidths(row);
  }

  const codeStart = state.text.length;

  const appendRow = (cells: TableCell[]) => {
    state.text += "|";
    for (let i = 0; i < columnCount; i += 1) {
      state.text += " ";
      const cell = cells[i];
      if (cell) {
        appendCell(state, cell);
      }
      const pad = widths[i] - (cell?.text.length ?? 0);
      if (pad > 0) {
        state.text += " ".repeat(pad);
      }
      state.text += " |";
    }
    state.text += "\n";
  };

  const appendDivider = () => {
    state.text += "|";
    for (let i = 0; i < columnCount; i += 1) {
      const dashCount = Math.max(3, widths[i]);
      state.text += ` ${"-".repeat(dashCount)} |`;
    }
    state.text += "\n";
  };

  appendRow(headers);
  appendDivider();
  for (const row of rows) {
    appendRow(row);
  }

  const codeEnd = state.text.length;
  if (codeEnd > codeStart) {
    state.styles.push({ start: codeStart, end: codeEnd, style: "code_block" });
  }
  if (state.env.listStack.length === 0) {
    state.text += "\n";
  }
}

/**
 * 630:P3 #64 -- Composite-style node registry replaces the 44-case switch.
 *
 * Each token type has its own MarkdownNode (a `{ render(token, state, renderChildren) }`
 * object). The registry IS the canonical token-type vocabulary; adding a new
 * token type means adding one entry, not a switch case. The walker
 * `renderTokens` is now the small dispatcher: it asks the registry for the
 * node and delegates rendering. Closure access keeps all per-state mutators
 * (appendText, openStyle, closeStyle, ...) private to this module while
 * still letting each node "behave like its own object."
 *
 * Note: `renderChildren` is passed in as the recursion hook so node bodies
 * never reach back into `renderTokens` directly -- this matches the
 * Composite contract that a parent node renders its children via the
 * walker, not via re-entry.
 */

type RenderChildren = (children: MarkdownToken[]) => void;
type MarkdownNode = {
  render: (token: MarkdownToken, state: RenderState, renderChildren: RenderChildren) => void;
};

const NODE_INLINE: MarkdownNode = {
  render: (token, state, renderChildren) => {
    const children = getTokenChildren(token);
    if (children.length > 0) {
      renderChildren(children);
    }
  },
};

const NODE_TEXT: MarkdownNode = {
  render: (token, state) => appendText(state, token.content ?? ""),
};

const NODE_IMAGE: MarkdownNode = {
  render: (token, state) => appendText(state, token.content ?? ""),
};

const NODE_BREAK: MarkdownNode = {
  render: (_token, state) => appendText(state, "\n"),
};

const NODE_HR: MarkdownNode = {
  render: (_token, state) => {
    state.text += "\n";
  },
};

const NODE_HTML: MarkdownNode = {
  render: (token, state) => appendText(state, token.content ?? ""),
};

const NODE_PARAGRAPH_CLOSE: MarkdownNode = {
  render: (_token, state) => appendParagraphSeparator(state),
};

const NODE_HEADING_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.headingStyle === "bold") {
      openStyle(state, "bold");
    }
  },
};

const NODE_HEADING_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.headingStyle === "bold") {
      closeStyle(state, "bold");
    }
    appendParagraphSeparator(state);
  },
};

const NODE_BLOCKQUOTE_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.blockquotePrefix) {
      state.text += state.blockquotePrefix;
    }
  },
};

const NODE_BLOCKQUOTE_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    state.text += "\n";
  },
};

function makeStyleOpenNode(style: MarkdownStyle): MarkdownNode {
  return { render: (_token, state) => openStyle(state, style) };
}

function makeStyleCloseNode(style: MarkdownStyle): MarkdownNode {
  return { render: (_token, state) => closeStyle(state, style) };
}

const NODE_SPOILER_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.enableSpoilers) {
      openStyle(state, "spoiler");
    }
  },
};

const NODE_SPOILER_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.enableSpoilers) {
      closeStyle(state, "spoiler");
    }
  },
};

const NODE_CODE_INLINE: MarkdownNode = {
  render: (token, state) => renderInlineCode(state, token.content ?? ""),
};

const NODE_CODE_BLOCK: MarkdownNode = {
  render: (token, state) => renderCodeBlock(state, token.content ?? ""),
};

const NODE_LINK_OPEN: MarkdownNode = {
  render: (token, state) => {
    const href = getAttr(token, "href") ?? "";
    const target = resolveRenderTarget(state);
    target.linkStack.push({ href, labelStart: target.text.length });
  },
};

const NODE_LINK_CLOSE: MarkdownNode = { render: (_token, state) => handleLinkClose(state) };

const NODE_BULLET_LIST_OPEN: MarkdownNode = {
  render: (_token, state) => state.env.listStack.push({ type: "bullet", index: 0 }),
};

const NODE_BULLET_LIST_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    state.env.listStack.pop();
  },
};

const NODE_ORDERED_LIST_OPEN: MarkdownNode = {
  render: (token, state) => {
    const start = Number(getAttr(token, "start") ?? "1");
    state.env.listStack.push({ type: "ordered", index: start - 1 });
  },
};

const NODE_ORDERED_LIST_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    state.env.listStack.pop();
  },
};

const NODE_LIST_ITEM_OPEN: MarkdownNode = {
  render: (_token, state) => appendListPrefix(state),
};

const NODE_LIST_ITEM_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    state.text += "\n";
  },
};

const NODE_TABLE_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.tableMode !== "off") {
      state.table = initTableState();
      state.hasTables = true;
    }
  },
};

const NODE_TABLE_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      if (state.tableMode === "bullets") {
        renderTableAsBullets(state);
      } else if (state.tableMode === "code") {
        renderTableAsCode(state);
      }
    }
    state.table = null;
  },
};

const NODE_THEAD_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      state.table.inHeader = true;
    }
  },
};

const NODE_THEAD_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      state.table.inHeader = false;
    }
  },
};

const NODE_NOOP: MarkdownNode = { render: () => undefined };

const NODE_TR_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      state.table.currentRow = [];
    }
  },
};

const NODE_TR_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      if (state.table.inHeader) {
        state.table.headers = state.table.currentRow;
      } else {
        state.table.rows.push(state.table.currentRow);
      }
      state.table.currentRow = [];
    }
  },
};

const NODE_CELL_OPEN: MarkdownNode = {
  render: (_token, state) => {
    if (state.table) {
      state.table.currentCell = initRenderTarget();
    }
  },
};

const NODE_CELL_CLOSE: MarkdownNode = {
  render: (_token, state) => {
    if (state.table?.currentCell) {
      state.table.currentRow.push(finishTableCell(state.table.currentCell));
      state.table.currentCell = null;
    }
  },
};

const NODE_DEFAULT: MarkdownNode = {
  render: (token, _state, renderChildren) => {
    if (token.children) {
      renderChildren(token.children);
    }
  },
};

/**
 * The Composite registry. The keys ARE the canonical token-type
 * vocabulary the renderer understands; adding a new token type means
 * adding a new MarkdownNode object + one map entry.
 */
const NODE_REGISTRY: Readonly<Record<string, MarkdownNode>> = {
  inline: NODE_INLINE,
  text: NODE_TEXT,
  em_open: makeStyleOpenNode("italic"),
  em_close: makeStyleCloseNode("italic"),
  strong_open: makeStyleOpenNode("bold"),
  strong_close: makeStyleCloseNode("bold"),
  s_open: makeStyleOpenNode("strikethrough"),
  s_close: makeStyleCloseNode("strikethrough"),
  code_inline: NODE_CODE_INLINE,
  spoiler_open: NODE_SPOILER_OPEN,
  spoiler_close: NODE_SPOILER_CLOSE,
  link_open: NODE_LINK_OPEN,
  link_close: NODE_LINK_CLOSE,
  image: NODE_IMAGE,
  softbreak: NODE_BREAK,
  hardbreak: NODE_BREAK,
  paragraph_close: NODE_PARAGRAPH_CLOSE,
  heading_open: NODE_HEADING_OPEN,
  heading_close: NODE_HEADING_CLOSE,
  blockquote_open: NODE_BLOCKQUOTE_OPEN,
  blockquote_close: NODE_BLOCKQUOTE_CLOSE,
  bullet_list_open: NODE_BULLET_LIST_OPEN,
  bullet_list_close: NODE_BULLET_LIST_CLOSE,
  ordered_list_open: NODE_ORDERED_LIST_OPEN,
  ordered_list_close: NODE_ORDERED_LIST_CLOSE,
  list_item_open: NODE_LIST_ITEM_OPEN,
  list_item_close: NODE_LIST_ITEM_CLOSE,
  code_block: NODE_CODE_BLOCK,
  fence: NODE_CODE_BLOCK,
  html_block: NODE_HTML,
  html_inline: NODE_HTML,
  table_open: NODE_TABLE_OPEN,
  table_close: NODE_TABLE_CLOSE,
  thead_open: NODE_THEAD_OPEN,
  thead_close: NODE_THEAD_CLOSE,
  tbody_open: NODE_NOOP,
  tbody_close: NODE_NOOP,
  tr_open: NODE_TR_OPEN,
  tr_close: NODE_TR_CLOSE,
  th_open: NODE_CELL_OPEN,
  td_open: NODE_CELL_OPEN,
  th_close: NODE_CELL_CLOSE,
  td_close: NODE_CELL_CLOSE,
  hr: NODE_HR,
};

/** Test seam: returns the node responsible for a given token type (or the default). */
export function nodeForTokenType(type: string): MarkdownNode {
  return NODE_REGISTRY[type] ?? NODE_DEFAULT;
}

function renderTokens(tokens: MarkdownToken[], state: RenderState): void {
  const renderChildren: RenderChildren = (children) => renderTokens(children, state);
  for (const token of tokens) {
    const node = NODE_REGISTRY[token.type] ?? NODE_DEFAULT;
    node.render(token, state, renderChildren);
  }
}

function closeRemainingStyles(target: RenderTarget) {
  for (let i = target.openStyles.length - 1; i >= 0; i -= 1) {
    const open = target.openStyles[i];
    const end = target.text.length;
    if (end > open.start) {
      target.styles.push({
        start: open.start,
        end,
        style: open.style,
      });
    }
  }
  target.openStyles = [];
}

function clampStyleSpans(spans: MarkdownStyleSpan[], maxLength: number): MarkdownStyleSpan[] {
  const clamped: MarkdownStyleSpan[] = [];
  for (const span of spans) {
    const start = Math.max(0, Math.min(span.start, maxLength));
    const end = Math.max(start, Math.min(span.end, maxLength));
    if (end > start) {
      clamped.push({ start, end, style: span.style });
    }
  }
  return clamped;
}

function clampLinkSpans(spans: MarkdownLinkSpan[], maxLength: number): MarkdownLinkSpan[] {
  const clamped: MarkdownLinkSpan[] = [];
  for (const span of spans) {
    const start = Math.max(0, Math.min(span.start, maxLength));
    const end = Math.max(start, Math.min(span.end, maxLength));
    if (end > start) {
      clamped.push({ start, end, href: span.href });
    }
  }
  return clamped;
}

function mergeStyleSpans(spans: MarkdownStyleSpan[]): MarkdownStyleSpan[] {
  const sorted = [...spans].toSorted((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    if (a.end !== b.end) {
      return a.end - b.end;
    }
    return a.style.localeCompare(b.style);
  });

  const merged: MarkdownStyleSpan[] = [];
  for (const span of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.style === span.style && span.start <= prev.end) {
      prev.end = Math.max(prev.end, span.end);
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

function sliceStyleSpans(
  spans: MarkdownStyleSpan[],
  start: number,
  end: number,
): MarkdownStyleSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const sliced: MarkdownStyleSpan[] = [];
  for (const span of spans) {
    const sliceStart = Math.max(span.start, start);
    const sliceEnd = Math.min(span.end, end);
    if (sliceEnd > sliceStart) {
      sliced.push({
        start: sliceStart - start,
        end: sliceEnd - start,
        style: span.style,
      });
    }
  }
  return mergeStyleSpans(sliced);
}

function sliceLinkSpans(spans: MarkdownLinkSpan[], start: number, end: number): MarkdownLinkSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const sliced: MarkdownLinkSpan[] = [];
  for (const span of spans) {
    const sliceStart = Math.max(span.start, start);
    const sliceEnd = Math.min(span.end, end);
    if (sliceEnd > sliceStart) {
      sliced.push({
        start: sliceStart - start,
        end: sliceEnd - start,
        href: span.href,
      });
    }
  }
  return sliced;
}

export function markdownToIR(markdown: string, options: MarkdownParseOptions = {}): MarkdownIR {
  return markdownToIRWithMeta(markdown, options).ir;
}

export function markdownToIRWithMeta(
  markdown: string,
  options: MarkdownParseOptions = {},
): { ir: MarkdownIR; hasTables: boolean } {
  const env: RenderEnv = { listStack: [] };
  const md = createMarkdownIt(options);
  const tokens = md.parse(markdown ?? "", env as unknown as object);
  if (options.enableSpoilers) {
    applySpoilerTokens(tokens as MarkdownToken[]);
  }

  const tableMode = options.tableMode ?? "off";

  const state: RenderState = {
    text: "",
    styles: [],
    openStyles: [],
    links: [],
    linkStack: [],
    env,
    headingStyle: options.headingStyle ?? "none",
    blockquotePrefix: options.blockquotePrefix ?? "",
    enableSpoilers: options.enableSpoilers ?? false,
    tableMode,
    table: null,
    hasTables: false,
  };

  renderTokens(tokens as MarkdownToken[], state);
  closeRemainingStyles(state);

  const trimmedText = state.text.trimEnd();
  const trimmedLength = trimmedText.length;
  let codeBlockEnd = 0;
  for (const span of state.styles) {
    if (span.style !== "code_block") {
      continue;
    }
    if (span.end > codeBlockEnd) {
      codeBlockEnd = span.end;
    }
  }
  const finalLength = Math.max(trimmedLength, codeBlockEnd);
  const finalText =
    finalLength === state.text.length ? state.text : state.text.slice(0, finalLength);

  return {
    ir: {
      text: finalText,
      styles: mergeStyleSpans(clampStyleSpans(state.styles, finalLength)),
      links: clampLinkSpans(state.links, finalLength),
    },
    hasTables: state.hasTables,
  };
}

export function chunkMarkdownIR(ir: MarkdownIR, limit: number): MarkdownIR[] {
  if (!ir.text) {
    return [];
  }
  if (limit <= 0 || ir.text.length <= limit) {
    return [ir];
  }

  const chunks = chunkText(ir.text, limit);
  const results: MarkdownIR[] = [];
  let cursor = 0;

  chunks.forEach((chunk, index) => {
    if (!chunk) {
      return;
    }
    if (index > 0) {
      while (cursor < ir.text.length && /\s/.test(ir.text[cursor] ?? "")) {
        cursor += 1;
      }
    }
    const start = cursor;
    const end = Math.min(ir.text.length, start + chunk.length);
    results.push({
      text: chunk,
      styles: sliceStyleSpans(ir.styles, start, end),
      links: sliceLinkSpans(ir.links, start, end),
    });
    cursor = end;
  });

  return results;
}
