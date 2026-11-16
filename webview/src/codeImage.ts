import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
// inlined as a data URL so the SVG is self-contained once it is an <img>
import geistMonoUrl from "./fonts/GeistMono-Variable.woff2?inline";

export const LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "json",
  "python",
  "bash",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "sql",
  "html",
  "css",
  "yaml",
  "markdown",
  "text",
] as const;

const THEME = "github-light";
const FONT_SIZE = 16;
const LINE_HEIGHT = 1.4;
const PAD = 20;
const FONT_STACK = "'Geist Mono', 'Noto Sans SC', ui-monospace, monospace";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(lang: string): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  const h = await highlighterPromise;
  if (lang !== "text" && !loadedLangs.has(lang)) {
    await h.loadLanguage(lang as any);
    loadedLangs.add(lang);
  }
  return h;
}

// Geist Mono advance is ~0.6em, CJK glyphs are 1em wide.
function charWidth(ch: string): number {
  return /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch)
    ? FONT_SIZE
    : FONT_SIZE * 0.6;
}
function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type CodeSvg = { svg: string; width: number; height: number };

export async function renderCodeSvg(
  code: string,
  lang: string
): Promise<CodeSvg> {
  const source = code.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const h = await getHighlighter(lang);
  const { tokens, bg, fg } = h.codeToTokens(source, {
    lang: lang as any,
    theme: THEME,
  });

  let maxW = 0;
  const lineH = FONT_SIZE * LINE_HEIGHT;
  const texts = tokens.map((line, i) => {
    let x = PAD;
    const y = PAD + i * lineH + FONT_SIZE;
    const spans = line
      .map((t) => {
        const out = `<tspan x="${x.toFixed(2)}" fill="${t.color ?? fg}">${esc(
          t.content
        )}</tspan>`;
        x += textWidth(t.content);
        return out;
      })
      .join("");
    maxW = Math.max(maxW, x);
    return `<text y="${y.toFixed(2)}" xml:space="preserve">${spans}</text>`;
  });

  const width = Math.ceil(maxW + PAD);
  const height = Math.ceil(PAD * 2 + tokens.length * lineH);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>@font-face{font-family:'Geist Mono';src:url(${geistMonoUrl}) format('woff2');font-weight:100 900}` +
    `text{font-family:${FONT_STACK};font-size:${FONT_SIZE}px}</style>` +
    `<rect width="${width}" height="${height}" rx="8" fill="${bg ?? "#fff"}" stroke="#d0d7de"/>` +
    texts.join("") +
    `</svg>`;
  return { svg, width, height };
}

export function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}
