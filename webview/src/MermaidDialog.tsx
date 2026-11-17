import { useEffect, useRef, useState } from "react";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToCanvas,
} from "@excalidraw/excalidraw";
import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

type Parsed = { elements: any[]; files: BinaryFiles };

const DEFAULT_SOURCE =
  "flowchart TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]\n  B -->|no| A";

export default function MermaidDialog(props: {
  api: ExcalidrawImperativeAPI;
  onClose: () => void;
  editing?: { mermaidId: string; source: string };
}) {
  const [source, setSource] = useState(props.editing?.source ?? DEFAULT_SOURCE);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const parsed = useRef<Parsed | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => taRef.current?.focus(), []);

  // debounced live preview
  useEffect(() => {
    if (!source.trim()) {
      parsed.current = null;
      setReady(false);
      previewRef.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        // loaded lazily: mermaid is large
        const { parseMermaidToExcalidraw } = await import(
          "@excalidraw/mermaid-to-excalidraw"
        );
        let ret;
        try {
          ret = await parseMermaidToExcalidraw(source);
        } catch {
          ret = await parseMermaidToExcalidraw(source.replace(/"/g, "'"));
        }
        const elements = convertToExcalidrawElements(ret.elements, {
          regenerateIds: true,
        }) as any[];
        const files = (ret.files ?? {}) as BinaryFiles;
        const canvas = await exportToCanvas({
          elements,
          files,
          exportPadding: 10,
          maxWidthOrHeight: 900,
        });
        if (cancelled) return;
        parsed.current = { elements, files };
        previewRef.current?.replaceChildren(canvas);
        setReady(true);
        setError("");
      } catch (e) {
        if (cancelled) return;
        parsed.current = null;
        setReady(false);
        setError((e as Error).message ?? String(e));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source]);

  const insert = () => {
    const data = parsed.current;
    if (!data || data.elements.length === 0) return;
    const { api } = props;
    const mermaidId =
      props.editing?.mermaidId ??
      `mmd-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    // all elements of one diagram share this tag; double-click finds the set
    const tagged = data.elements.map((el) => ({
      ...el,
      customData: { ...el.customData, mermaidId, mermaidSource: source },
    }));
    const fileList = Object.values(data.files) as BinaryFileData[];
    if (fileList.length) api.addFiles(fileList);

    // bounding box of the new diagram
    const minX = Math.min(...tagged.map((e) => e.x));
    const minY = Math.min(...tagged.map((e) => e.y));
    const maxX = Math.max(...tagged.map((e) => e.x + (e.width ?? 0)));
    const maxY = Math.max(...tagged.map((e) => e.y + (e.height ?? 0)));
    const w = maxX - minX;
    const h = maxY - minY;

    const scene = api.getSceneElements() as any[];
    let cx: number;
    let cy: number;
    let kept = scene;
    if (props.editing) {
      // replace in place: anchor the new diagram at the old one's center
      const old = scene.filter(
        (e) => !e.isDeleted && e.customData?.mermaidId === mermaidId
      );
      if (old.length) {
        const ox1 = Math.min(...old.map((e) => e.x));
        const oy1 = Math.min(...old.map((e) => e.y));
        const ox2 = Math.max(...old.map((e) => e.x + e.width));
        const oy2 = Math.max(...old.map((e) => e.y + e.height));
        cx = (ox1 + ox2) / 2;
        cy = (oy1 + oy2) / 2;
      } else {
        const s = api.getAppState();
        cx = -s.scrollX + s.width / 2 / s.zoom.value;
        cy = -s.scrollY + s.height / 2 / s.zoom.value;
      }
      // soft-delete (not filter) so undo can bring the old diagram back
      kept = scene.map((e) =>
        e.customData?.mermaidId === mermaidId && !e.isDeleted
          ? {
              ...e,
              isDeleted: true,
              version: e.version + 1,
              versionNonce: Math.floor(Math.random() * 2 ** 31),
              updated: Date.now(),
            }
          : e
      );
    } else {
      const s = api.getAppState();
      cx = -s.scrollX + s.width / 2 / s.zoom.value;
      cy = -s.scrollY + s.height / 2 / s.zoom.value;
    }
    const dx = cx - w / 2 - minX;
    const dy = cy - h / 2 - minY;
    const moved = tagged.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));

    api.updateScene({
      elements: [...kept, ...moved],
      appState: {
        selectedElementIds: Object.fromEntries(
          moved.map((e) => [e.id, true as const])
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
        <h3>{props.editing ? "Edit Mermaid" : "Mermaid to Excalidraw"}</h3>
        <p className="code-dialog-hint">
          Inserted as editable elements. Double-click the diagram later to edit
          this source (Alt + double-click edits a single text instead).
        </p>
        <div className="code-dialog-panels">
          <div className="code-dialog-panel">
            <label>Mermaid syntax</label>
            <textarea
              ref={taRef}
              value={source}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div className="code-dialog-panel">
            <label>Preview</label>
            <div className="code-dialog-preview">
              {error && <span className="code-dialog-error">{error}</span>}
              <div ref={previewRef} />
            </div>
          </div>
        </div>
        <div className="code-dialog-actions">
          <button
            className="code-dialog-insert"
            disabled={!ready}
            onClick={insert}
          >
            {props.editing ? "Update →" : "Insert →"}
          </button>
          <span className="code-dialog-hint">Cmd/Ctrl + Enter</span>
        </div>
      </div>
    </div>
  );
}
