/**
 * Tiny localStorage helpers for recent funds and "I SIP on". The URL still carries only the
 * fund code: nothing here is a salary window or a second answer.
 */

export type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const fallback = new Map<string, string>();

export function browserStore(): MemoryStore {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Private mode can throw on access.
  }
  return {
    getItem: (key) => fallback.get(key) ?? null,
    setItem: (key, value) => {
      fallback.set(key, value);
    },
  };
}

export const RECENTS_KEY = "sip-date-planner.recents.v1";
export const SIP_DAY_KEY = "sip-date-planner.sip-day.v1";
export const NAMED_DAYS_KEY = "sip-date-planner.named-days.v1";
export const MAX_RECENTS = 5;
export const MAX_NAMED_DAYS = 50;

export type RecentFund = {
  code: number;
  name: string;
  house: string;
  category: string;
  verdict?: "noise" | "marginal" | "meaningful";
  spreadPp?: number;
};

export function readRecents(store: MemoryStore = browserStore()): RecentFund[] {
  const raw = store.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is RecentFund => {
        if (row === null || typeof row !== "object") return false;
        const candidate = row as RecentFund;
        return typeof candidate.code === "number" && typeof candidate.name === "string";
      })
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function rememberFund(fund: RecentFund, store: MemoryStore = browserStore()): RecentFund[] {
  const next = [fund, ...readRecents(store).filter((row) => row.code !== fund.code)].slice(0, MAX_RECENTS);
  store.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

export function readSipDay(store: MemoryStore = browserStore()): number | null {
  const raw = store.getItem(SIP_DAY_KEY);
  if (raw === null) return null;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 28) return null;
  return day;
}

export function writeSipDay(day: number, store: MemoryStore = browserStore()): number | null {
  if (!Number.isInteger(day) || day < 1 || day > 28) return readSipDay(store);
  store.setItem(SIP_DAY_KEY, String(day));
  return day;
}

type NamedDayEntry = { code: number; day: number };

function readNamedDays(store: MemoryStore): NamedDayEntry[] {
  const raw = store.getItem(NAMED_DAYS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is NamedDayEntry => {
      if (row === null || typeof row !== "object") return false;
      const candidate = row as NamedDayEntry;
      return (
        typeof candidate.code === "number" &&
        Number.isInteger(candidate.day) &&
        candidate.day >= 1 &&
        candidate.day <= 28
      );
    });
  } catch {
    return [];
  }
}

/**
 * Writes this visit's named day. Returns the previous named day for this fund when it differs,
 * otherwise null — first visit and an unchanged pick stay quiet.
 */
export function takeNamedDayShift(
  code: number,
  namedDay: number,
  store: MemoryStore = browserStore(),
): number | null {
  if (!Number.isInteger(namedDay) || namedDay < 1 || namedDay > 28) return null;
  const entries = readNamedDays(store);
  const previous = entries.find((row) => row.code === code)?.day ?? null;
  const next = [{ code, day: namedDay }, ...entries.filter((row) => row.code !== code)].slice(
    0,
    MAX_NAMED_DAYS,
  );
  store.setItem(NAMED_DAYS_KEY, JSON.stringify(next));
  if (previous === null || previous === namedDay) return null;
  return previous;
}
