// In-memory лимитер логина (ревью 2.1: брутфорс на публичном IP ничем не ограничен).
// Для одного standalone-инстанса достаточно; на VPS дополняется nginx limit_req.
const fails = new Map<string, { count: number; until: number }>();

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60_000; // 15 минут

export function isBlocked(key: string): boolean {
  const e = fails.get(key);
  if (!e) return false;
  if (Date.now() > e.until) {
    fails.delete(key);
    return false;
  }
  return e.count >= MAX_FAILS;
}

export function registerFail(key: string): void {
  const e = fails.get(key);
  if (!e || Date.now() > e.until) {
    fails.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  } else {
    e.count++;
  }
  // защита от распухания Map при распределённом переборе email'ов
  if (fails.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of fails) if (now > v.until) fails.delete(k);
  }
}

export function resetFails(key: string): void {
  fails.delete(key);
}
