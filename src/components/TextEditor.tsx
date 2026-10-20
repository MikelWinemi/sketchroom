import { useLayoutEffect, useRef } from 'react';
import type { Editor, TextEdit } from '../editor';
import type { Camera } from '../model';
import { FONT_FAMILY, LINE_HEIGHT, measureText } from '../geometry';

/** A textarea laid over the canvas, positioned and scaled to match the text shape being edited. */
export function TextEditor({ editor, edit, camera }: { editor: Editor; edit: TextEdit; camera: Camera }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
  }, []);

  const { z } = camera;
  const { w, h } = measureText(edit.text || ' ', edit.fontSize);

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={edit.text}
      spellCheck={false}
      wrap="off"
      style={{
        left: (edit.x - camera.x) * z,
        top: (edit.y - camera.y) * z,
        // Extra width leaves room for the caret before the shape re-measures
        width: (w + edit.fontSize) * z,
        height: h * z,
        fontFamily: FONT_FAMILY,
        fontSize: edit.fontSize * z,
        lineHeight: LINE_HEIGHT,
        color: edit.color,
      }}
      onChange={(e) => editor.setEditingText(e.target.value)}
      onBlur={editor.commitText}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          editor.commitText();
        }
      }}
    />
  );
}
