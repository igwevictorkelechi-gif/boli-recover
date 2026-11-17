import { supabaseConfigured, supabaseAdmin } from "./supabaseServer";

// Single-use tracking for ownership challenges.
//
// With Supabase configured, used nonces go in `ownership_challenges` (unique
// index on nonce), which holds across every server instance. Without it, an
// in-memory set covers this instance only — fine for one server, best-effort
// on serverless. Either way a replayed signature can only ever re-prove
// ownership to its own owner; it can't move anything.

const memory = new Map<string, number>(); // nonce -> expiry (ms)

function sweep(now: number) {
  for (const [nonce, exp] of memory) if (exp <= now) memory.delete(nonce);
}

// Returns true if this call consumed the nonce, false if it was already used.
export async function consumeNonce(o: {
  nonce: string;
  address: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
}): Promise<boolean> {
  if (supabaseConfigured()) {
    const { error } = await supabaseAdmin()
      .from("ownership_challenges")
      .insert({
        address: o.address.toLowerCase(),
        nonce: o.nonce,
        message: o.message,
        issued_at: o.issuedAt,
        expires_at: o.expiresAt,
        verified_at: new Date().toISOString(),
      });
    if (!error) return true;
    if (error.code === "23505") return false; // unique violation: replay
    throw new Error(`Could not record verification: ${error.message}`);
  }

  const now = Date.now();
  sweep(now);
  if (memory.has(o.nonce)) return false;
  memory.set(o.nonce, Date.parse(o.expiresAt) || now + 10 * 60 * 1000);
  return true;
}
