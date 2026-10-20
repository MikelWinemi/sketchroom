import { BringToFront, Copy, SendToBack, Trash2 } from 'lucide-react';
import type { Editor, UiState } from '../editor';
import { COLORS, type SizeKey } from '../model';
import { keepFocus } from './keepFocus';

const SIZE_OPTIONS: { size: SizeKey; label: string }[] = [
  { size: 's', label: 'S' },
  { size: 'm', label: 'M' },
  { size: 'l', label: 'L' },
];

export function StylePanel({ editor, ui }: { editor: Editor; ui: UiState }) {
  const drawing = !['select', 'hand', 'eraser'].includes(ui.tool);
  if (!drawing && !ui.hasSelection && !ui.editing) return null;

  return (
    <div className="panel style-panel" onPointerDown={keepFocus}>
      <div className="swatches" role="group" aria-label="Color">
        {COLORS.map((color) => (
          <button
            key={color}
            className="swatch"
            style={{ background: color }}
            aria-label={`Color ${color}`}
            aria-pressed={ui.color === color}
            onClick={() => editor.setColor(color)}
          />
        ))}
      </div>
      <div className="sizes" role="group" aria-label="Size">
        {SIZE_OPTIONS.map(({ size, label }) => (
          <button key={size} className="size-btn" aria-pressed={ui.size === size} onClick={() => editor.setSize(size)}>
            {label}
          </button>
        ))}
      </div>
      {ui.hasSelection && !ui.editing && (
        <div className="actions">
          <button className="icon-btn" title="Duplicate (⌘D)" aria-label="Duplicate" onClick={() => editor.duplicate()}>
            <Copy size={16} />
          </button>
          <button className="icon-btn" title="Bring to front (])" aria-label="Bring to front" onClick={() => editor.reorder('front')}>
            <BringToFront size={16} />
          </button>
          <button className="icon-btn" title="Send to back ([)" aria-label="Send to back" onClick={() => editor.reorder('back')}>
            <SendToBack size={16} />
          </button>
          <button className="icon-btn danger" title="Delete (Del)" aria-label="Delete" onClick={() => editor.deleteSelection()}>
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
