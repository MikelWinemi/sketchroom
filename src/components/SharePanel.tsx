import { Download, Share2 } from 'lucide-react';
import { useState } from 'react';
import { boardUrl } from '../api';
import type { SessionState } from '../collab/session';
import type { Editor } from '../editor';
import { exportPng, exportSvg } from '../export';
import { MAX_NAME_LENGTH, USER_COLORS, initials, type User } from '../user';
import { CopyField } from './CopyField';
import { usePopover } from './usePopover';

const MAX_AVATARS = 4;

interface Props {
  boardId: string;
  editKey: string | undefined;
  state: SessionState;
  editor: Editor;
  user: User;
  onUserChange: (user: User) => void;
}

export function SharePanel({ boardId, editKey, state, editor, user, onUserChange }: Props) {
  const share = usePopover<HTMLDivElement>();
  const exporter = usePopover<HTMLDivElement>();
  const profile = usePopover<HTMLDivElement>();
  const [, rerender] = useState(0);

  const others = state.peers;
  const shown = others.slice(0, MAX_AVATARS);
  const canShareEdit = !state.readOnly && editKey;

  const runExport = (kind: 'png' | 'svg') => {
    const shapes = editor.exportShapes();
    const name = state.title || 'sketchroom';
    if (kind === 'png') exportPng(shapes, name);
    else exportSvg(shapes, name);
    exporter.setOpen(false);
  };

  return (
    <div className="panel share-panel">
      <div className="avatars" aria-label={`${others.length + 1} people here`}>
        {shown.map((peer) => (
          <span key={peer.clientId} className="avatar" style={{ background: peer.color }} title={peer.name}>
            {initials(peer.name)}
          </span>
        ))}
        {others.length > MAX_AVATARS && (
          <span className="avatar more" title={others.slice(MAX_AVATARS).map((p) => p.name).join(', ')}>
            +{others.length - MAX_AVATARS}
          </span>
        )}
        <div className="popover-anchor" ref={profile.ref}>
          <button
            className="avatar me"
            style={{ background: user.color }}
            title={`${user.name} (you) — click to rename`}
            aria-label="Your name and color"
            onClick={profile.toggle}
          >
            {initials(user.name)}
          </button>
          {profile.open && (
            <div className="popover profile-popover">
              <label className="field-label" htmlFor="profile-name">
                Your name
              </label>
              <input
                id="profile-name"
                className="text-field"
                value={user.name}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                onChange={(e) => onUserChange({ ...user, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && profile.setOpen(false)}
              />
              <div className="color-row" role="group" aria-label="Your color">
                {USER_COLORS.map((color) => (
                  <button
                    key={color}
                    className="swatch small"
                    style={{ background: color }}
                    aria-label={`Color ${color}`}
                    aria-pressed={user.color === color}
                    onClick={() => onUserChange({ ...user, color })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="popover-anchor" ref={exporter.ref}>
        <button
          className="icon-btn"
          title="Export"
          aria-label="Export"
          onClick={() => {
            rerender((n) => n + 1);
            exporter.toggle();
          }}
        >
          <Download size={18} />
        </button>
        {exporter.open && (
          <div className="popover menu">
            <p className="popover-note">{editor.selection.size ? 'Export selection' : 'Export whole board'}</p>
            <button className="menu-item" disabled={!editor.exportShapes().length} onClick={() => runExport('png')}>
              PNG image
            </button>
            <button className="menu-item" disabled={!editor.exportShapes().length} onClick={() => runExport('svg')}>
              SVG vector
            </button>
          </div>
        )}
      </div>

      <div className="popover-anchor" ref={share.ref}>
        <button className="btn primary small" onClick={share.toggle}>
          <Share2 size={14} />
          Share
        </button>
        {share.open && (
          <div className="popover share-popover">
            <h3>Share this board</h3>
            {canShareEdit && (
              <div className="share-row">
                <span className="badge edit">Can edit</span>
                <CopyField label="Edit link" value={boardUrl(boardId, editKey)} />
                <p className="popover-note">Anyone with this link can draw and change the board.</p>
              </div>
            )}
            <div className="share-row">
              <span className="badge">View only</span>
              <CopyField label="View link" value={boardUrl(boardId)} />
              <p className="popover-note">
                {canShareEdit ? 'People with this link can watch live but not edit.' : "You're viewing this board. Ask its owner for an edit link to draw."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
