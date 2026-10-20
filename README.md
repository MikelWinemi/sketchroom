# Sketchroom

A collaborative online whiteboard. Create a board, share the link, and draw together in real time.

```sh
npm install
npm run dev     # sync server on :1234 + Vite on http://localhost:5173
npm run build   # typecheck client and server, build the client into dist/
npm start       # production: one Node process serves dist/ and sync on $PORT (default 1234)
```

Requires Node 23.6+ (the server runs TypeScript directly and uses the built-in `node:sqlite`).

## How it works

- **Sync:** each board is a Yjs document. Clients connect to a [Hocuspocus](https://tiptap.dev/docs/hocuspocus) WebSocket server at `/ws`; edits merge without conflicts and work offline until reconnect.
- **Storage:** the server keeps each board's Yjs state in SQLite (`data/sketchroom.db`, override with `DATA_DIR`), saving about a second after changes stop.
- **Access:** `POST /api/boards` returns a board id and a secret edit key. The edit link is `/b/<id>#edit=<key>` — the key sits in the URL fragment so it never appears in server logs. Without a valid key the server marks the connection read-only, so viewers can't write even with a modified client. Only a hash of the key is stored.
- **Presence:** names, colors, cursors and selections travel over Yjs awareness and are never saved.
- **Undo** is per user (`Y.UndoManager` tracking only local changes); a whole drag is one step.
- **No accounts:** your name/color and your list of boards (including edit keys) live in this browser's localStorage.

## Layout

| Path | Role |
| --- | --- |
| `server/index.ts` | HTTP API, static hosting, Hocuspocus auth + persistence hooks |
| `server/boards.ts` | SQLite board table: ids, hashed edit keys, saved state |
| `src/store.ts` | Yjs-backed document with batched gestures and per-user undo |
| `src/collab/session.ts` | One open board: provider, connection status, presence, title |
| `src/editor.ts` | Canvas engine: input, tools, camera, selection, rendering |
| `src/model.ts`, `geometry.ts`, `render.ts` | Shape types, hit testing/transforms, drawing |
| `src/export.ts` | PNG and SVG export |
| `src/pages/` | Welcome page and board page |
| `src/components/` | Toolbar, panels, share/export popovers, text editor overlay |

In development, `window.sketchroom` exposes the current `editor` and `session` for debugging.

## Shortcuts

| Key | Action |
| --- | --- |
| V H P E R O L A T | Select, hand, pen, eraser, rectangle, ellipse, line, arrow, text |
| Space + drag / middle-drag / scroll | Pan |
| Ctrl/⌘ + scroll, ⌘+ ⌘- ⌘0, ⇧1 | Zoom, reset, zoom to fit |
| ⌘Z / ⌘⇧Z | Undo / redo (your own changes) |
| ⌘A ⌘C ⌘X ⌘V ⌘D | Select all, copy, cut, paste, duplicate |
| Delete, arrows (⇧ for 10px), ] [ | Delete, nudge, bring to front / send to back |
| Shift while drawing / resizing | Square/circle, snap lines to 15° / keep aspect ratio |
| Double-click / Enter | Edit text (double-click empty space to add text) |
