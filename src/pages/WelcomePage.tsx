import { ArrowRight, Download, Link2, MousePointer2, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { boardPath, createBoard, parseBoardLink } from '../api';
import { Logo } from '../components/Logo';
import { forgetBoard, listRecent, rememberBoard, type RecentBoard } from '../recent';
import { navigate } from '../router';
import { MAX_NAME_LENGTH, USER_COLORS, loadUser, saveUser, type User } from '../user';

function timeAgo(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(time).toLocaleDateString();
}

const FEATURES = [
  {
    Icon: MousePointer2,
    title: 'Draw together, live',
    body: 'See everyone’s cursor and every stroke as it happens. Undo only touches your own changes.',
  },
  {
    Icon: Link2,
    title: 'Share the right access',
    body: 'Send an edit link to collaborators, or a view-only link to anyone who just needs to watch.',
  },
  {
    Icon: Download,
    title: 'Take it with you',
    body: 'Boards save automatically. Export the whole board or a selection as PNG or SVG.',
  },
];

export function WelcomePage() {
  const [user, setUser] = useState(loadUser);
  const [recent, setRecent] = useState(listRecent);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');

  const updateUser = (next: User) => {
    setUser(next);
    saveUser(next);
  };

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const { id, editKey } = await createBoard();
      rememberBoard(id, { editKey, openedAt: Date.now() });
      navigate(boardPath(id, editKey));
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseBoardLink(link);
    if (!parsed) {
      setError('That doesn’t look like a Sketchroom link. Paste the full link someone shared with you.');
      return;
    }
    navigate(boardPath(parsed.id, parsed.editKey));
  };

  const remove = (board: RecentBoard) => {
    forgetBoard(board.id);
    setRecent(listRecent());
  };

  return (
    <div className="welcome">
      <header className="welcome-nav">
        <div className="brand">
          <Logo />
          Sketchroom
        </div>
      </header>

      <main className="welcome-main">
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Think out loud, <span className="underline">together</span>.
            </h1>
            <p className="lede">
              Sketchroom is a shared whiteboard for quick diagrams, brainstorms and doodles. Start a board, send the link,
              and draw with anyone in real time. No sign-up needed.
            </p>

            <div className="hero-actions">
              <button className="btn primary large" onClick={create} disabled={creating}>
                <Plus size={18} />
                {creating ? 'Creating…' : 'New board'}
              </button>
              <form className="join-form" onSubmit={join}>
                <input
                  className="text-field"
                  aria-label="Board link"
                  placeholder="Paste a board link to join"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setError('');
                  }}
                />
                <button className="btn" type="submit" disabled={!link.trim()}>
                  Join
                  <ArrowRight size={16} />
                </button>
              </form>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <div className="identity">
              <label className="field-label" htmlFor="welcome-name">
                Your name on boards
              </label>
              <div className="identity-row">
                <input
                  id="welcome-name"
                  className="text-field"
                  value={user.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(e) => updateUser({ ...user, name: e.target.value })}
                />
                <div className="color-row" role="group" aria-label="Your cursor color">
                  {USER_COLORS.map((color) => (
                    <button
                      key={color}
                      className="swatch small"
                      style={{ background: color }}
                      aria-label={`Color ${color}`}
                      aria-pressed={user.color === color}
                      onClick={() => updateUser({ ...user, color })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <HeroIllustration user={user} />
        </section>

        {recent.length > 0 && (
          <section className="recent" aria-labelledby="recent-heading">
            <h2 id="recent-heading">Your boards</h2>
            <ul className="recent-grid">
              {recent.map((board) => (
                <li key={board.id} className="recent-card">
                  <a
                    href={boardPath(board.id, board.editKey)}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(boardPath(board.id, board.editKey));
                    }}
                  >
                    <span className="recent-title">{board.title || 'Untitled board'}</span>
                    <span className="recent-meta">
                      <span className={`badge ${board.editKey ? 'edit' : ''}`}>{board.editKey ? 'Can edit' : 'View only'}</span>
                      Opened {timeAgo(board.openedAt)}
                    </span>
                  </a>
                  <button className="recent-remove" aria-label={`Remove ${board.title || 'Untitled board'} from this list`} title="Remove from list" onClick={() => remove(board)}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <p className="recent-note">This list lives in this browser. Removing a board here doesn’t delete it.</p>
          </section>
        )}

        <section className="features" aria-label="Features">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="feature">
              <span className="feature-icon">
                <Icon size={18} />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="welcome-footer">Sketchroom · boards save automatically as you draw</footer>
    </div>
  );
}

/** A little board with two collaborators, drawn in the same style as the real canvas. */
function HeroIllustration({ user }: { user: User }) {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 480 360">
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#d3d7de" />
          </pattern>
        </defs>
        <rect width="480" height="360" rx="20" fill="#f8f9fb" />
        <rect width="480" height="360" rx="20" fill="url(#dots)" />

        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="52" y="64" width="150" height="92" rx="4" stroke="#1e1e1e" strokeWidth="4" />
          <ellipse cx="350" cy="110" rx="78" ry="50" stroke="#1971c2" strokeWidth="4" />
          <path d="M206 112 L268 112 M256 102 L268 112 L256 122" stroke="#1e1e1e" strokeWidth="4" />
          <path
            className="draw-path"
            d="M70 260 C 110 210, 150 300, 195 250 S 270 220, 300 262 S 370 300, 410 240"
            stroke="#e03131"
            strokeWidth="6"
          />
        </g>
        <text x="127" y="117" textAnchor="middle" fontSize="20" fontWeight="600" fill="#1e1e1e" fontFamily="system-ui, sans-serif">
          Idea
        </text>
        <text x="350" y="117" textAnchor="middle" fontSize="20" fontWeight="600" fill="#1971c2" fontFamily="system-ui, sans-serif">
          Launch
        </text>

        <g className="cursor cursor-a">
          <Cursor color={user.color} name={user.name || 'You'} />
        </g>
        <g className="cursor cursor-b">
          <Cursor color="#2f9e44" name="Sam" />
        </g>
      </svg>
    </div>
  );
}

function Cursor({ color, name }: { color: string; name: string }) {
  const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
  return (
    <>
      <path d="M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7.2 11 L12.5 11 Z" fill={color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="10" y="20" width={label.length * 7.4 + 14} height="22" rx="6" fill={color} />
      <text x="17" y="35" fontSize="12" fontWeight="600" fill="#fff" fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </>
  );
}
