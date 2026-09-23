// Safe localStorage wrapper. Private windows, blocked storage or a full
// quota must never crash OLIS — we just fall back to in-memory state.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  chats: "olis.chats",
  settings: "olis.settings",
} as const;
