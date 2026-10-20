/** The local person's identity shown to collaborators. Stored per browser; no accounts. */
export interface User {
  name: string;
  color: string;
}

const STORAGE_KEY = 'sketchroom:user:v1';

export const USER_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c', '#0c8599', '#e8590c'];

const ADJECTIVES = ['Swift', 'Quiet', 'Bright', 'Curious', 'Bold', 'Gentle', 'Clever', 'Sunny', 'Brave', 'Calm'];
const ANIMALS = ['Otter', 'Falcon', 'Panda', 'Fox', 'Heron', 'Lynx', 'Koala', 'Badger', 'Gecko', 'Owl'];

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export function loadUser(): User {
  try {
    const user = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof user?.name === 'string' && typeof user?.color === 'string') return user;
  } catch {
    // Fall through to a fresh identity
  }
  const user = { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(USER_COLORS) };
  saveUser(user);
  return user;
}

export function saveUser(user: User) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Identity just won't persist across visits
  }
}

export const MAX_NAME_LENGTH = 32;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
