import * as Y from 'yjs';
import type { Doc, Shape } from './model';

/** How often live gesture changes (drawing, dragging) are sent to collaborators. */
const FLUSH_INTERVAL_MS = 50;

/**
 * The shared document: a Yjs map of shapes, exposed to the editor as an
 * immutable snapshot (`Doc`) with undo/redo.
 *
 * Gestures call begin(), then set() many times, then end(). Changes inside a
 * gesture apply locally right away but go to the Yjs doc (and the network)
 * at most every FLUSH_INTERVAL_MS, and the whole gesture is one undo step.
 * Undo only reverts this user's own changes.
 */
export class Store {
  private readonly ydoc: Y.Doc;
  private readonly map: Y.Map<Shape>;
  private readonly undoManager: Y.UndoManager;
  /** Marks transactions made by this store, so undo only tracks local edits. */
  private readonly origin = {};
  private readonly listeners = new Set<() => void>();

  private snapshot: Doc;
  /** Local changes not yet written to the Yjs doc, and the snapshot they were based on. */
  private pending: Doc | null = null;
  private pendingBase: Doc | null = null;
  private flushTimer = 0;
  private inBatch = false;
  private flushedInBatch = false;

  readOnly = false;

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc;
    this.map = ydoc.getMap<Shape>('shapes');
    this.snapshot = this.map.toJSON() as Doc;
    // stopCapturing() at gesture boundaries decides what merges into one undo step
    this.undoManager = new Y.UndoManager(this.map, { trackedOrigins: new Set([this.origin]), captureTimeout: Infinity });
    this.undoManager.on('stack-item-added', this.emit);
    this.undoManager.on('stack-item-popped', this.emit);
    this.map.observe(this.onYChange);
  }

  destroy() {
    this.flush();
    this.map.unobserve(this.onYChange);
    this.undoManager.destroy();
    this.listeners.clear();
  }

  private onYChange = (event: Y.YMapEvent<Shape>, tx: Y.Transaction) => {
    // Update the snapshot incrementally so unchanged shapes keep their identity (and caches)
    const next = { ...this.snapshot };
    for (const [id, change] of event.changes.keys) {
      if (change.action === 'delete') delete next[id];
      else next[id] = this.map.get(id)!;
    }
    this.snapshot = next;

    // A collaborator changed the doc mid-gesture: replay our unsent changes on top
    if (this.pending && this.pendingBase && tx.origin !== this.origin) {
      const rebased = { ...next };
      for (const id in this.pending) if (this.pending[id] !== this.pendingBase[id]) rebased[id] = this.pending[id];
      for (const id in this.pendingBase) if (!(id in this.pending)) delete rebased[id];
      this.pending = rebased;
      this.pendingBase = next;
    }
    this.emit();
  };

  get(): Doc {
    return this.pending ?? this.snapshot;
  }

  get canUndo() {
    return this.undoManager.undoStack.length > 0;
  }

  get canRedo() {
    return this.undoManager.redoStack.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  begin() {
    if (this.inBatch) return;
    this.inBatch = true;
    this.flushedInBatch = false;
    this.undoManager.stopCapturing();
  }

  set(doc: Doc) {
    if (this.readOnly || doc === this.get()) return;
    if (!this.pending) this.pendingBase = this.snapshot;
    this.pending = doc;
    if (!this.inBatch) this.flush();
    else if (!this.flushTimer) this.flushTimer = window.setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
    this.emit();
  }

  end() {
    if (!this.inBatch) return;
    this.flush();
    this.inBatch = false;
    this.undoManager.stopCapturing();
    this.emit();
  }

  /** Abandons the current gesture, reverting anything it already sent. */
  cancel() {
    if (!this.inBatch) return;
    this.inBatch = false;
    clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    this.pending = null;
    this.pendingBase = null;
    if (this.flushedInBatch) {
      this.undoManager.undo();
      this.undoManager.redoStack.pop();
    }
    this.undoManager.stopCapturing();
    this.emit();
  }

  /** Applies a single change as its own undo step. */
  apply(fn: (doc: Doc) => Doc) {
    if (this.inBatch) return this.set(fn(this.get()));
    this.begin();
    this.set(fn(this.get()));
    this.end();
  }

  undo() {
    if (!this.inBatch && !this.readOnly) this.undoManager.undo();
  }

  redo() {
    if (!this.inBatch && !this.readOnly) this.undoManager.redo();
  }

  private flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = 0;
    const { pending, pendingBase } = this;
    if (!pending || !pendingBase) return;
    this.pending = null;
    this.pendingBase = null;
    let changed = false;
    this.ydoc.transact(() => {
      for (const id in pending) {
        if (pending[id] === pendingBase[id]) continue;
        this.map.set(id, pending[id]);
        changed = true;
      }
      for (const id in pendingBase) {
        if (id in pending) continue;
        this.map.delete(id);
        changed = true;
      }
    }, this.origin);
    if (changed && this.inBatch) this.flushedInBatch = true;
  }

  private emit = () => {
    for (const fn of this.listeners) fn();
  };
}
