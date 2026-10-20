import { Minus, Plus, Redo2, Undo2 } from 'lucide-react';
import type { Editor, UiState } from '../editor';
import { keepFocus } from './keepFocus';

export function BottomBar({ editor, ui }: { editor: Editor; ui: UiState }) {
  return (
    <div className="panel bottom-bar" onPointerDown={keepFocus}>
      {!ui.readOnly && (
        <>
          <button className="icon-btn" title="Undo (⌘Z)" aria-label="Undo" disabled={!ui.canUndo} onClick={() => editor.undo()}>
            <Undo2 size={18} />
          </button>
          <button className="icon-btn" title="Redo (⌘⇧Z)" aria-label="Redo" disabled={!ui.canRedo} onClick={() => editor.redo()}>
            <Redo2 size={18} />
          </button>
          <div className="divider" />
        </>
      )}
      <button className="icon-btn" title="Zoom out (⌘-)" aria-label="Zoom out" onClick={() => editor.zoomBy(0.8)}>
        <Minus size={18} />
      </button>
      <button className="zoom-label" title="Reset zoom (⌘0) · Zoom to fit (⇧1)" onClick={() => editor.resetZoom()}>
        {Math.round(ui.camera.z * 100)}%
      </button>
      <button className="icon-btn" title="Zoom in (⌘+)" aria-label="Zoom in" onClick={() => editor.zoomBy(1.25)}>
        <Plus size={18} />
      </button>
    </div>
  );
}
