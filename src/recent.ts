/** Boards this browser has opened, for the welcome page. Edit keys live here so creators keep edit access. */
export interface RecentBoard {
  id: string;
  title: string;
  editKey?: string;
  openedAt: number;
}

const STORAGE_KEY = 'sketchroom:recent:v1';
const MAX_RECENT = 30;

export function listRecent(): RecentBoard[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.sort((a: RecentBoard, b: RecentBoard) => b.openedAt - a.openedAt) : [];
  } catch {
    return [];
  }
}

function save(list: RecentBoard[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    // Recent list is a convenience only
  }
}

export function rememberBoard(id: string, patch: Partial<Omit<RecentBoard, 'id'>>) {
  const list = listRecent();
  const existing = list.find((b) => b.id === id);
  const next: RecentBoard = { id, title: '', openedAt: Date.now(), ...existing, ...patch };
  // Never drop an edit key we already had just because this visit came from a view link
  if (!next.editKey && existing?.editKey) next.editKey = existing.editKey;
  save([next, ...list.filter((b) => b.id !== id)].sort((a, b) => b.openedAt - a.openedAt));
}

export function forgetBoard(id: string) {
  save(listRecent().filter((b) => b.id !== id));
}

export const editKeyFor = (id: string) => listRecent().find((b) => b.id === id)?.editKey;
