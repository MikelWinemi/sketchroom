import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'sketchroom.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    edit_key_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    state BLOB
  );
`);

const insertBoard = db.prepare('INSERT INTO boards (id, edit_key_hash, created_at, updated_at) VALUES (?, ?, ?, ?)');
const selectKeyHash = db.prepare('SELECT edit_key_hash FROM boards WHERE id = ?');
const selectState = db.prepare('SELECT state FROM boards WHERE id = ?');
const updateState = db.prepare('UPDATE boards SET state = ?, updated_at = ? WHERE id = ?');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomId(length: number): string {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join('');
}

const hashKey = (key: string) => createHash('sha256').update(key).digest();

/**
 * Creates a board. The edit key is returned once and only its hash is stored:
 * anyone holding the key can edit, everyone else who knows the id can view.
 */
export function createBoard(): { id: string; editKey: string } {
  const id = randomId(10);
  const editKey = randomId(24);
  const now = Date.now();
  insertBoard.run(id, hashKey(editKey).toString('hex'), now, now);
  return { id, editKey };
}

export function boardExists(id: string): boolean {
  return selectKeyHash.get(id) !== undefined;
}

export function canEdit(id: string, key: string): boolean {
  const row = selectKeyHash.get(id) as { edit_key_hash: string } | undefined;
  if (!row || !key) return false;
  return timingSafeEqual(Buffer.from(row.edit_key_hash, 'hex'), hashKey(key));
}

export function loadState(id: string): Uint8Array | null {
  const row = selectState.get(id) as { state: Uint8Array | null } | undefined;
  return row?.state ?? null;
}

export function saveState(id: string, state: Uint8Array) {
  updateState.run(state, Date.now(), id);
}
