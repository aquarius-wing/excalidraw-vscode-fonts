import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type ParsedTable = { rows: string[][]; header: boolean };

/** Minimal TSV parser: supports "quoted cells" with tabs / newlines / "" . */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseMarkdownTable(text: string): string[][] | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim());
  if (lines.length < 2 || !lines.every((l) => l.includes("|"))) {
    return null;
  }
  const split = (l: string) =>
    l
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, "|"));
  const isSeparator = (l: string) =>
    split(l).every((c) => /^:?-{1,}:?$/.test(c));
  if (!isSeparator(lines[1])) {
    return null;
  }
  return [split(lines[0]), ...lines.slice(2).map(split)];
}

export function parseClipboardTable(text: string): ParsedTable | null {
  const md = parseMarkdownTable(text);
  if (md) {
    return { rows: normalize(md), header: true };
  }
  // TSV: what Excel / Google Sheets / Lark sheets / Numbers put on the clipboard
  if (text.includes("\t")) {
    const rows = parseTsv(text);
    // drop the empty trailing row produced by a final newline
    while (rows.length && rows[rows.length - 1].every((c) => c === "")) {
      rows.pop();
    }
    if (rows.length > 0 && rows.some((r) => r.length > 1)) {
      return { rows: normalize(rows), header: false };
    }
  }
  return null;
}

function normalize(rows: string[][]): string[][] {
  const cols = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(cols - r.length).fill("")]);
}

const FONT_SIZE = 16;
const PAD_X = 24;
const PAD_Y = 16;
const LINE_HEIGHT = 1.25;
const MIN_W = 64;

// Geist Mono is ~0.6em wide, CJK glyphs are 1em wide.
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)
      ? FONT_SIZE
      : FONT_SIZE * 0.6;
  }
  return w;
}

export function insertTable(
  api: ExcalidrawImperativeAPI,
  table: ParsedTable
): void {
  const { rows, header } = table;
  const cols = rows[0].length;

  const colWidths = Array.from({ length: cols }, (_, c) =>
    Math.max(
      MIN_W,
      Math.ceil(
        Math.max(
          ...rows.map((r) =>
            Math.max(...r[c].split("\n").map((l) => textWidth(l)))
          )
        ) + PAD_X
      )
    )
  );
  const rowHeights = rows.map((r) =>
    Math.ceil(
      Math.max(...r.map((cell) => cell.split("\n").length)) *
        FONT_SIZE *
        LINE_HEIGHT +
        PAD_Y
    )
  );

  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const totalH = rowHeights.reduce((a, b) => a + b, 0);

  // place the table at the center of the current viewport
  const s = api.getAppState();
  const originX = -s.scrollX + s.width / 2 / s.zoom.value - totalW / 2;
  const originY = -s.scrollY + s.height / 2 / s.zoom.value - totalH / 2;

  const groupId = `table-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const skeleton: any[] = [];
  let y = originY;
  rows.forEach((row, r) => {
    let x = originX;
    row.forEach((cell, c) => {
      skeleton.push({
        type: "rectangle",
        x,
        y,
        width: colWidths[c],
        height: rowHeights[r],
        roughness: 0,
        roundness: null,
        strokeWidth: 1,
        groupIds: [groupId],
        backgroundColor: header && r === 0 ? "#e9ecef" : "transparent",
        fillStyle: "solid",
        ...(cell
          ? {
              label: {
                text: cell,
                fontSize: FONT_SIZE,
                fontFamily: FONT_FAMILY.Nunito,
                groupIds: [groupId],
              },
            }
          : {}),
      });
      x += colWidths[c];
    });
    y += rowHeights[r];
  });

  const created = convertToExcalidrawElements(skeleton).map((el: any) =>
    el.type === "text" && el.containerId ? { ...el, groupIds: [groupId] } : el
  );

  api.updateScene({
    elements: [...api.getSceneElements(), ...created],
    appState: {
      selectedElementIds: Object.fromEntries(
        created.map((el: any) => [el.id, true as const])
      ),
      selectedGroupIds: { [groupId]: true },
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
