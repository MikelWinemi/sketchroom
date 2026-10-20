import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Editor } from './editor';
import { Toolbar } from './components/Toolbar';
import { StylePanel } from './components/StylePanel';
import { BottomBar } from './components/BottomBar';
import { TextEditor } from './components/TextEditor';

export default function App() {
  const [editor] = useState(() => new Editor());
  const ui = useSyncExternalStore(editor.subscribeUi, editor.getUi);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => editor.mount(canvasRef.current!), [editor]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="board" />
      {ui.isEmpty && !ui.editing && (
        <div className="empty-hint">
          Start drawing anywhere
          <span>Space + drag to pan · Ctrl/⌘ + scroll to zoom</span>
        </div>
      )}
      {ui.editing && <TextEditor key={ui.editing.id} editor={editor} edit={ui.editing} camera={ui.camera} />}
      <Toolbar editor={editor} ui={ui} />
      <StylePanel editor={editor} ui={ui} />
      <BottomBar editor={editor} ui={ui} />
    </div>
  );
}
