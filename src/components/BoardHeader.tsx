import type { BoardSession, SessionState } from '../collab/session';
import { MAX_TITLE_LENGTH } from '../collab/session';
import { navigate } from '../router';
import { Logo } from './Logo';

const STATUS_LABELS: Record<SessionState['status'], string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  offline: 'Offline — changes will sync when you reconnect',
  'not-found': 'Board not found',
};

export function BoardHeader({ session, state }: { session: BoardSession; state: SessionState }) {
  return (
    <div className="panel board-header">
      <a
        href="/"
        className="home-link"
        title="All boards"
        onClick={(e) => {
          e.preventDefault();
          navigate('/');
        }}
      >
        <Logo size={26} />
      </a>
      {state.readOnly ? (
        <span className="title-text">{state.title || 'Untitled board'}</span>
      ) : (
        <input
          className="title-input"
          aria-label="Board title"
          placeholder="Untitled board"
          value={state.title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => session.setTitle(e.target.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
        />
      )}
      <span className={`status-dot ${state.status}`} title={STATUS_LABELS[state.status]} aria-label={STATUS_LABELS[state.status]} />
    </div>
  );
}
