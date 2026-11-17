import { createHmac, timingSafeEqual } from "crypto";

// All server-side signing derives from SESSION_SECRET, with a separate key per
// purpose so a token minted for one job (an ownership challenge) can never be
// replayed as another (a session). Server-only.

function rootSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters",
    );
  }
  return s;
}

export function hasSecret(): boolean {
  const s = process.env.SESSION_SECRET;
  return Boolean(s && s.length >= 32);
}

export type Purpose = "session" | "challenge";

export function hmac(purpose: Purpose, data: string): Buffer {
  const key = createHmac("sha256", rootSecret())
    .update(`boli:${purpose}`)
    .digest();
  return createHmac("sha256", key).update(data).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
