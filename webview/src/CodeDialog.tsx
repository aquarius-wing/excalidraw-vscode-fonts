import { useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  LANGUAGES,
  renderCodeSvg,
  svgToDataUrl,
  type CodeSvg,
} from "./codeImage.ts";

export default function CodeDialog(props: {
  api: ExcalidrawImperativeAPI;
  onClose: () => void;
  editing?: { elementId: string; code: string; lang: string };
}) {
  const [code, setCode] = useState(props.editing?.code ?? "");
  const [lang, setLang] = useState<string>(props.editing?.lang ?? "typescript");
  const [result, setResult] = useState<CodeSvg | null>(null);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => taRef.current?.focus(), []);

  // debounced live preview
  useEffect(() => {
    if (!code.trim()) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await renderCodeSvg(code, lang);
        if (!cancelled) {
          setResult(r);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, lang]);

  const insert = () => {
    if (!result) return;
    const { api } = props;
    const fileId = `code-${Date.now().toString(36)}` as any;
    api.addFiles([
      {
        id: fileId,
        mimeType: "image/svg+xml",
        dataURL: svgToDataUrl(result.svg) as any,
        created: Date.now(),
      },
    ]);
    const customData = { code, lang };
    if (props.editing) {
      // replace the image in place, keeping its position (anchored at center)
      const id = props.editing.elementId;
      api.updateScene({
        elements: api.getSceneElements().map((el: any) => {
          if (el.id !== id) return el;
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          return {
            ...el,
            fileId,
            x: cx - result.width / 2,
            y: cy - result.height / 2,
            width: result.width,
            height: result.height,
            customData,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 2 ** 31),
            updated: Date.now(),
          };
        }),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      props.onClose();
      return;
    }
    const s = api.getAppState();
    const x = -s.scrollX + s.width / 2 / s.zoom.value - result.width / 2;
    const y = -s.scrollY + s.height / 2 / s.zoom.value - result.height / 2;
    const created = convertToExcalidrawElements([
      {
        type: "image",
        fileId,
        x,
        y,
        width: result.width,
        height: result.height,
        status: "saved",
      } as any,
    ]).map((el: any) => ({ ...el, customData }));
    api.updateScene({
      elements: [...api.getSceneElements(), ...created],
      appState: {
        selectedElementIds: Object.fromEntries(
          created.map((el: any) => [el.id, true as const])
        ),
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    props.onClose();
  };

  return (
    <div className="code-dialog-backdrop" onMouseDown={props.onClose}>
      <div
        className="code-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) insert();
        }}
      >
        <h3>{props.editing ? "Edit code" : "Code to Excalidraw"}</h3>
        <p className="code-dialog-hint">
          Paste code; it is inserted as a syntax-highlighted image.
        </p>
        <div className="code-dialog-panels">
          <div className="code-dialog-panel">
            <label>
              Language{" "}
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              ref={taRef}
              value={code}
              spellCheck={false}
              placeholder="Paste code here"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="code-dialog-panel">
            <label>Preview</label>
            <div className="code-dialog-preview">
              {error ? (
                <span className="code-dialog-error">{error}</span>
              ) : result ? (
                <img src={svgToDataUrl(result.svg)} alt="preview" />
              ) : null}
            </div>
          </div>
        </div>
        <div className="code-dialog-actions">
          <button className="code-dialog-insert" disabled={!result} onClick={insert}>
            {props.editing ? "Update →" : "Insert →"}
          </button>
          <span className="code-dialog-hint">Cmd/Ctrl + Enter</span>
        </div>
      </div>
    </div>
  );
}
