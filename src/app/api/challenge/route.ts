import { randomBytes } from "crypto";
import { isAddress, getAddress } from "viem";
import { buildChallengeMessage } from "@/lib/ownership";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address } = body;
  if (!address || !isAddress(address)) {
    return Response.json({ error: "Enter a valid EVM address" }, { status: 400 });
  }

  const addr = getAddress(address);
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const message = buildChallengeMessage({ address: addr, nonce, issuedAt });

  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("ownership_challenges").insert({
      address: addr.toLowerCase(),
      nonce,
      message,
      issued_at: issuedAt,
      expires_at: expiresAt,
    });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create challenge";
    return Response.json({ error: message }, { status: 500 });
  }
}
