// Small fixed-window rate limiter, keyed by client IP + route.
//
// In-memory, so on serverless each instance counts separately — it blunts
// bursts and scripted abuse of the free public RPCs rather than enforcing an
// exact global quota. Put a shared store (e.g. Upstash) behind the same
// function if you need hard limits.

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();
let lastSweep = 0;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Returns a 429 Response when over the limit, or null to continue.
export function rateLimit(
  req: Request,
  name: string,
  max: number,
  windowMs: number,
): Response | null {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    lastSweep = now;
  }
  const key = `${name}:${clientIp(req)}`;
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(key, w);
  }
  w.count++;
  if (w.count <= max) return null;
  const retry = Math.ceil((w.resetAt - now) / 1000);
  return Response.json(
    { error: `Too many requests. Try again in ${retry}s.` },
    { status: 429, headers: { "retry-after": String(retry) } },
  );
}
