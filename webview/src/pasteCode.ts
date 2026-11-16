import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type ParsedCode = { code: string; lang: string };

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)[^\n]*\n([\s\S]*?)\n\s*\1\s*$/;

// Lines that look like code rather than prose.
const SIGNALS: RegExp[] = [
  /[;{}]\s*$/, // statement / block ends
  /^\s*(\/\/|#!|#include|\/\*|\*\/|<!--)/, // comments, shebang, include
  /^\s*(import|export|from|const|let|var|function|class|def|return|if|else|for|while|try|catch|package|public|private|func|fn|use|SELECT|INSERT|UPDATE|CREATE)\b/,
  /=>|->|::|:=|===?|!==?|&&|\|\|/, // operators
  /^\s*[\w.$]+\([^)]*\)\s*[:{;]?\s*$/, // call / signature
  /^\s*[\])}]+[,;]?\s*$/, // closing brackets
  /^\s*<\/?[A-Za-z][^>]*>\s*$/, // markup tags
  /^\s*["']?[\w-]+["']?\s*:\s*\S/, // key: value (json / yaml)
  /^\s*\$\s+\S/, // shell prompt
];

function expandTabs(s: string): string {
  return s.replace(/\t/g, "    ");
}

export function parseClipboardCode(text: string): ParsedCode | null {
  const trimmed = text.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "");

  // 1. Fenced Markdown block: ```lang ... ```
  const m = trimmed.match(FENCE);
  if (m) {
    return { code: expandTabs(m[3]), lang: m[2] };
  }

  // 2. Heuristic for unfenced code: several lines, most of which look like code
  const lines = trimmed.split("\n");
  if (lines.length < 3) return null;
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length < 3) return null;
  const hits = nonEmpty.filter((l) => SIGNALS.some((re) => re.test(l))).length;
  const indented = nonEmpty.filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  if (hits / nonEmpty.length >= 0.6 || (hits >= 2 && indented / nonEmpty.length >= 0.4)) {
    return { code: expandTabs(trimmed), lang: "" };
  }
  return null;
}

const FONT_SIZE = 16;
const PAD = 16;
const LINE_HEIGHT = 1.25;

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

export function insertCode(
  api: ExcalidrawImperativeAPI,
  { code }: ParsedCode
): void {
  const lines = code.split("\n");
  const width = Math.ceil(Math.max(...lines.map(textWidth)) + PAD * 2);
  const height = Math.ceil(lines.length * FONT_SIZE * LINE_HEIGHT + PAD * 2);

  const s = api.getAppState();
  const x = -s.scrollX + s.width / 2 / s.zoom.value - width / 2;
  const y = -s.scrollY + s.height / 2 / s.zoom.value - height / 2;

  const created = convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width,
      height,
      roughness: 0,
      roundness: { type: 3 },
      strokeWidth: 1,
      strokeColor: "#ced4da",
      backgroundColor: "#f1f3f5",
      fillStyle: "solid",
      label: {
        text: code,
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY.Nunito,
        textAlign: "left",
        verticalAlign: "top",
      },
    } as any,
  ]);

  api.updateScene({
    elements: [...api.getSceneElements(), ...created],
    appState: {
      selectedElementIds: Object.fromEntries(
        created.map((el: any) => [el.id, true as const])
      ),
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
