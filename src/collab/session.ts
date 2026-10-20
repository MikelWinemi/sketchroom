import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import * as Y from 'yjs';
import type { Peer, Presence } from '../editor';
import type { Vec } from '../model';
import { Store } from '../store';
import type { User } from '../user';

export type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'not-found';

export interface SessionState {
  status: ConnectionStatus;
  /** True once the board's saved content has arrived from the server. */
  synced: boolean;
  readOnly: boolean;
  title: string;
  peers: Peer[];
}

const CURSOR_INTERVAL_MS = 40;
export const MAX_TITLE_LENGTH = 80;

const socketUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/**
 * One open board: the Yjs document, its connection to the sync server, and
 * presence (who's here, where their cursor is). Implements Presence for the editor.
 */
export class BoardSession implements Presence {
  readonly id: string;
  readonly doc = new Y.Doc();
  readonly store: Store;
  private readonly provider: HocuspocusProvider;
  private readonly meta: Y.Map<string>;
  private readonly listeners = new Set<() => void>();
  private state: SessionState;
  private cursorTimer = 0;
  private queuedCursor: Vec | null | undefined;

  constructor(id: string, editKey: string | undefined, user: User) {
    this.id = id;
    this.store = new Store(this.doc);
    // Until the server confirms, only someone holding a key may edit
    this.store.readOnly = !editKey;
    this.meta = this.doc.getMap<string>('meta');
    this.state = { status: 'connecting', synced: false, readOnly: !editKey, title: '', peers: [] };

    this.provider = new HocuspocusProvider({
      url: socketUrl(),
      name: id,
      document: this.doc,
      token: editKey ?? 'view',
      onStatus: ({ status }) => {
        if (this.state.status === 'not-found') return;
        this.update({
          status:
            status === WebSocketStatus.Connected ? 'connected' : status === WebSocketStatus.Connecting ? 'connecting' : 'offline',
        });
      },
      onAuthenticated: ({ scope }) => {
        const readOnly = scope === 'readonly';
        this.store.readOnly = readOnly;
        this.update({ readOnly });
      },
      onAuthenticationFailed: ({ reason }) => {
        if (reason !== 'not-found') return;
        this.update({ status: 'not-found' });
        // Stop reconnect attempts for a board that doesn't exist
        queueMicrotask(() => this.provider.destroy());
      },
      onSynced: ({ state }) => this.update({ synced: state }),
    });

    this.awareness.setLocalStateField('user', user);
    this.awareness.on('change', this.onAwarenessChange);
    this.meta.observe(this.onMetaChange);
  }

  private get awareness() {
    return this.provider.awareness!;
  }

  destroy() {
    clearTimeout(this.cursorTimer);
    this.awareness.off('change', this.onAwarenessChange);
    this.meta.unobserve(this.onMetaChange);
    this.provider.destroy();
    this.store.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  // ---- State for React ----

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private onMetaChange = () => this.update({ title: this.meta.get('title') ?? '' });

  private onAwarenessChange = () => {
    const peers: Peer[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.doc.clientID || !state.user) return;
      peers.push({
        clientId,
        name: String(state.user.name ?? 'Anonymous').slice(0, 32),
        color: String(state.user.color ?? '#868e96'),
        cursor: state.cursor ?? null,
        selection: Array.isArray(state.selection) ? state.selection : [],
      });
    });
    this.update({ peers });
  };

  setTitle(title: string) {
    if (this.state.readOnly) return;
    this.meta.set('title', title.slice(0, MAX_TITLE_LENGTH));
  }

  setUser(user: User) {
    this.awareness.setLocalStateField('user', user);
  }

  // ---- Presence ----

  peers = () => this.state.peers;

  setCursor(p: Vec | null) {
    this.queuedCursor = p;
    if (this.cursorTimer) return;
    this.sendCursor();
    this.cursorTimer = window.setTimeout(() => {
      this.cursorTimer = 0;
      if (this.queuedCursor !== undefined) this.sendCursor();
    }, CURSOR_INTERVAL_MS);
  }

  private sendCursor() {
    const p = this.queuedCursor;
    this.queuedCursor = undefined;
    this.awareness.setLocalStateField('cursor', p ? { x: Math.round(p.x), y: Math.round(p.y) } : null);
  }

  setSelection(ids: string[]) {
    this.awareness.setLocalStateField('selection', ids);
  }
}
