import type { Doc } from './model';

const MAX_HISTORY = 200;

/**
 * Holds the current document and its undo/redo history.
 *
 * Gestures (dragging, drawing) call begin(), then set() many times, then end(),
 * so the whole gesture becomes a single undo step.
 */
export class Store {
  private doc: Doc;
  private undoStack: Doc[] = [];
  private redoStack: Doc[] = [];
  private batchStart: Doc | null = null;
  private listeners = new Set<() => void>();

  constructor(initial: Doc) {
    this.doc = initial;
  }

  get(): Doc {
    return this.doc;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  begin() {
    this.batchStart ??= this.doc;
  }

  /** Replaces the document. Outside a batch the change is not recorded in history. */
  set(doc: Doc) {
    if (doc === this.doc) return;
    this.doc = doc;
    this.emit();
  }

  end() {
    const start = this.batchStart;
    if (!start) return;
    this.batchStart = null;
    if (start !== this.doc) {
      this.undoStack.push(start);
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
    }
    this.emit();
  }

  /** Abandons the current batch and restores the document from before it. */
  cancel() {
    const start = this.batchStart;
    if (!start) return;
    this.batchStart = null;
    this.doc = start;
    this.emit();
  }

  /** Applies a single change as its own undo step. */
  apply(fn: (doc: Doc) => Doc) {
    if (this.batchStart) {
      this.set(fn(this.doc));
      return;
    }
    this.begin();
    this.set(fn(this.doc));
    this.end();
  }

  undo() {
    if (this.batchStart) return;
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.doc);
    this.doc = prev;
    this.emit();
  }

  redo() {
    if (this.batchStart) return;
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.doc);
    this.doc = next;
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
