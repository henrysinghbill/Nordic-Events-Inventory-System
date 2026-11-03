import "server-only";

/**
 * Simple in-memory limiter for failed logins. Fine for a single app instance
 * (which is how this app is deployed). Resets when the app restarts.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_USER_AND_IP = 8;
const MAX_FAILURES_PER_IP = 40;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function bucket(key: string, now: number): Bucket {
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  return b;
}

function keys(ip: string, username: string) {
  return { pair: `u:${username.toLowerCase()}|${ip}`, ip: `ip:${ip}` };
}

/** Returns minutes to wait if blocked, otherwise null. */
export function loginBlocked(ip: string, username: string, now = Date.now()): number | null {
  const k = keys(ip, username);
  const pair = bucket(k.pair, now);
  const byIp = bucket(k.ip, now);
  if (pair.count >= MAX_FAILURES_PER_USER_AND_IP || byIp.count >= MAX_FAILURES_PER_IP) {
    const resetAt = Math.max(pair.resetAt, byIp.resetAt);
    return Math.max(1, Math.ceil((resetAt - now) / 60000));
  }
  return null;
}

export function recordLoginFailure(ip: string, username: string, now = Date.now()) {
  const k = keys(ip, username);
  bucket(k.pair, now).count++;
  bucket(k.ip, now).count++;
  // Keep the map from growing forever.
  if (buckets.size > 10_000) {
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }
}

export function clearLoginFailures(ip: string, username: string) {
  buckets.delete(keys(ip, username).pair);
}
