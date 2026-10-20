export interface CreatedBoard {
  id: string;
  editKey: string;
}

export async function createBoard(): Promise<CreatedBoard> {
  let res: Response;
  try {
    res = await fetch('/api/boards', { method: 'POST' });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Couldn't create a board (error ${res.status}).`);
  }
  return res.json();
}

/** Edit access travels in the URL fragment, which browsers never send to the server. */
export const boardPath = (id: string, editKey?: string) => `/b/${id}${editKey ? `#edit=${editKey}` : ''}`;

export const boardUrl = (id: string, editKey?: string) => location.origin + boardPath(id, editKey);

export function editKeyFromHash(hash: string): string | undefined {
  return new URLSearchParams(hash.replace(/^#/, '')).get('edit') ?? undefined;
}

/** Accepts a full board link, a /b/... path, or a bare board id. */
export function parseBoardLink(input: string): { id: string; editKey?: string } | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(text, location.origin);
    const match = url.pathname.match(/^\/b\/([A-Za-z0-9]+)\/?$/);
    if (match) return { id: match[1], editKey: editKeyFromHash(url.hash) };
  } catch {
    // Not a URL; try a bare id below
  }
  return /^[A-Za-z0-9]{6,32}$/.test(text) ? { id: text } : null;
}
