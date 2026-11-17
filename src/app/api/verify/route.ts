import { isAddress, getAddress } from "viem";
import { verifySignature } from "@/lib/ownership";
import { issueSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { address?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, signature } = body;
  if (!address || !isAddress(address) || !signature) {
    return Response.json(
      { error: "Missing address or signature" },
      { status: 400 },
    );
  }

  const addr = getAddress(address);

  try {
    const sb = supabaseAdmin();

    // Most recent still-valid, unverified challenge for this address.
    const { data, error } = await sb
      .from("ownership_challenges")
      .select("*")
      .eq("address", addr.toLowerCase())
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const row = data?.[0];
    if (!row) {
      return Response.json(
        { verified: false, error: "No active challenge. Request a new one." },
        { status: 400 },
      );
    }

    const ok = await verifySignature({
      message: row.message as string,
      signature: signature as `0x${string}`,
      address: addr,
    });

    if (!ok) {
      return Response.json(
        { verified: false, error: "Signature does not match this address" },
        { status: 401 },
      );
    }

    // Sign the session first: if SESSION_SECRET is misconfigured this throws
    // before the challenge is consumed, so the user can retry the same one.
    // A short-lived signed token (HS256 JWT, 15 min) that /api/transfer
    // requires before building a transaction for this address. Not stored —
    // the signature on it is the proof.
    const { token, expiresAt } = issueSession(addr);

    // Consume the challenge. The `verified_at is null` filter makes this
    // single-use: if two requests race with the same signature, only one
    // update matches a row, and only that one gets a session.
    const { data: consumed, error: updError } = await sb
      .from("ownership_challenges")
      .update({ verified_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("verified_at", null)
      .select("id");
    if (updError) {
      return Response.json({ error: updError.message }, { status: 500 });
    }
    if (!consumed || consumed.length === 0) {
      return Response.json(
        { verified: false, error: "Challenge already used. Request a new one." },
        { status: 409 },
      );
    }

    return Response.json({ verified: true, token, expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
