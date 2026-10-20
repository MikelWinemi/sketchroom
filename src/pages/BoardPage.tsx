import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { editKeyFromHash } from '../api';
import { BoardSession } from '../collab/session';
import { Editor } from '../editor';
import { editKeyFor, forgetBoard, rememberBoard } from '../recent';
import { navigate } from '../router';
import { loadUser, saveUser, type User } from '../user';
import { BoardHeader } from '../components/BoardHeader';
import { BottomBar } from '../components/BottomBar';
import { SharePanel } from '../components/SharePanel';
import { StylePanel } from '../components/StylePanel';
import { TextEditor } from '../components/TextEditor';
import { Toolbar } from '../components/Toolbar';

export function BoardPage({ id }: { id: string }) {
  // A key in the link wins; otherwise fall back to one this browser saved earlier
  const [editKey] = useState(() => editKeyFromHash(location.hash) ?? editKeyFor(id));
  const [user, setUser] = useState(loadUser);
  const [session, setSession] = useState<BoardSession | null>(null);

  useEffect(() => {
    const s = new BoardSession(id, editKey, loadUser());
    setSession(s);
    rememberBoard(id, { editKey, openedAt: Date.now() });
    return () => s.destroy();
  }, [id, editKey]);

  const changeUser = (next: User) => {
    setUser(next);
    saveUser(next);
    session?.setUser(next);
  };

  if (!session) return null;
  return <Board key={session.doc.guid} session={session} editKey={editKey} user={user} onUserChange={changeUser} />;
}

interface BoardProps {
  session: BoardSession;
  editKey: string | undefined;
  user: User;
  onUserChange: (user: User) => void;
}

function Board({ session, editKey, user, onUserChange }: BoardProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [editor] = useState(() => new Editor(session.store, session));
  const ui = useSyncExternalStore(editor.subscribeUi, editor.getUi);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => editor.mount(canvasRef.current!), [editor]);
  useEffect(() => {
    // Handy for debugging in the console; stripped from production builds
    if (import.meta.env.DEV) Object.assign(window, { sketchroom: { editor, session } });
  }, [editor, session]);
  useEffect(() => editor.setReadOnly(state.readOnly), [editor, state.readOnly]);

  useEffect(() => {
    if (state.title) rememberBoard(session.id, { title: state.title });
    document.title = state.title ? `${state.title} · Sketchroom` : 'Sketchroom';
    return () => {
      document.title = 'Sketchroom';
    };
  }, [session.id, state.title]);

  useEffect(() => {
    if (state.status === 'not-found') forgetBoard(session.id);
  }, [session.id, state.status]);

  if (state.status === 'not-found') {
    return (
      <div className="center-message">
        <h1>Board not found</h1>
        <p>This link doesn't point to a board. It may have been mistyped.</p>
        <button className="btn primary" onClick={() => navigate('/')}>
          Go to your boards
        </button>
      </div>
    );
  }

  let hint: { title: string; detail?: string } | null = null;
  if (!state.synced) {
    hint = state.status === 'offline' ? { title: "Can't reach the server", detail: 'Retrying…' } : { title: 'Loading board…' };
  } else if (ui.isEmpty && !ui.editing) {
    hint = state.readOnly
      ? { title: 'This board is empty', detail: 'Drawings will appear here live' }
      : { title: 'Start drawing anywhere', detail: 'Space + drag to pan · Ctrl/⌘ + scroll to zoom' };
  }

  return (
    <div className="app">
      <canvas ref={canvasRef} className="board" />
      {hint && (
        <div className="empty-hint">
          {hint.title}
          {hint.detail && <span>{hint.detail}</span>}
        </div>
      )}
      {ui.editing && <TextEditor key={ui.editing.id} editor={editor} edit={ui.editing} camera={ui.camera} />}
      <BoardHeader session={session} state={state} />
      <Toolbar editor={editor} ui={ui} />
      <SharePanel boardId={session.id} editKey={editKey} state={state} editor={editor} user={user} onUserChange={onUserChange} />
      <StylePanel editor={editor} ui={ui} />
      <BottomBar editor={editor} ui={ui} />
    </div>
  );
}
