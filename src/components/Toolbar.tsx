import { Circle, Eraser, Hand, Minus, MousePointer2, MoveUpRight, Pencil, Square, Type, type LucideIcon } from 'lucide-react';
import type { Editor, UiState } from '../editor';
import { TOOL_SHORTCUTS, type Tool } from '../model';
import { keepFocus } from './keepFocus';

const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: 'select', label: 'Select', Icon: MousePointer2 },
  { tool: 'hand', label: 'Hand', Icon: Hand },
  { tool: 'pen', label: 'Pen', Icon: Pencil },
  { tool: 'eraser', label: 'Eraser', Icon: Eraser },
  { tool: 'rect', label: 'Rectangle', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', Icon: Circle },
  { tool: 'line', label: 'Line', Icon: Minus },
  { tool: 'arrow', label: 'Arrow', Icon: MoveUpRight },
  { tool: 'text', label: 'Text', Icon: Type },
];

export function Toolbar({ editor, ui }: { editor: Editor; ui: UiState }) {
  return (
    <div className="panel toolbar" role="toolbar" aria-label="Tools" onPointerDown={keepFocus}>
      {TOOLS.map(({ tool, label, Icon }) => (
        <button
          key={tool}
          className="icon-btn"
          aria-pressed={ui.tool === tool}
          aria-label={label}
          title={`${label} (${TOOL_SHORTCUTS[tool]})`}
          onClick={() => editor.setTool(tool)}
        >
          <Icon size={18} strokeWidth={1.75} />
          <span className="kbd">{TOOL_SHORTCUTS[tool]}</span>
        </button>
      ))}
    </div>
  );
}
