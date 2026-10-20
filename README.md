# Sketchroom

A collaborative online whiteboard. Phases 1–2 (single-player canvas and whiteboard features) are done; multiplayer is next.

```sh
npm install
npm run dev     # http://localhost:5173
npm run build   # typecheck + production build
```

## Layout

| File | Role |
| --- | --- |
| `src/model.ts` | Shape types, constants, immutable doc helpers |
| `src/store.ts` | Document + undo/redo history (gestures batch into one step) |
| `src/geometry.ts` | Bounds, hit testing, move/resize transforms, text measurement |
| `src/render.ts` | Draws shapes on the canvas (freehand via perfect-freehand) |
| `src/editor.ts` | Engine: input, tools, camera, selection, render loop |
| `src/components/` | React toolbar, style panel, zoom/undo bar, text editor overlay |

The board is a map of immutable shapes keyed by id, so phase 3 can swap `Store` for a Yjs `Y.Map` + `Y.UndoManager` without touching rendering or geometry.

## Shortcuts

| Key | Action |
| --- | --- |
| V H P E R O L A T | Select, hand, pen, eraser, rectangle, ellipse, line, arrow, text |
| Space + drag / middle-drag / scroll | Pan |
| Ctrl/⌘ + scroll, ⌘+ ⌘- ⌘0, ⇧1 | Zoom, reset, zoom to fit |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌘A ⌘C ⌘X ⌘V ⌘D | Select all, copy, cut, paste, duplicate |
| Delete, arrows (⇧ for 10px), ] [ | Delete, nudge, bring to front / send to back |
| Shift while drawing | Square/circle, snap lines to 15° |
| Shift while resizing | Keep aspect ratio |
| Double-click / Enter | Edit text (double-click empty space to add text) |
