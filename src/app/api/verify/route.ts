import { isAddress, getAddress, isHex } from "viem";
import {
  buildChallengeMessage,
  readChallenge,
  verifySignature,
} from "@/lib/ownership";
import { consumeNonce } from "@/lib/nonceStore";
import { issueSession } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Checks the wallet's signature over the challenge message. On success the
// challenge is consumed (single use) and a 15-minute session token is issued;
// /api/transfer requires it before building any transaction.
export async function POST(req: Request) {
  const limited = rateLimit(req, "verify", 20, 60_000);
  if (limited) return limited;

  let body: { address?: string; signature?: string; challenge?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, signature, challenge } = body;
  if (
    !address ||
    !isAddress(address) ||
    !signature ||
    !isHex(signature) ||
    !challenge
  ) {
    return Response.json(
      { verified: false, error: "Missing address, signature or challenge" },
      { status: 400 },
    );
  }
  const addr = getAddress(address);

  try {
    const check = readChallenge(challenge, addr);
    if (!check.ok) {
      return Response.json(
        { verified: false, error: check.reason },
        { status: 400 },
      );
    }

    // Rebuild the message from the signed challenge — never trust a message
    // sent by the client.
    const message = buildChallengeMessage(check.challenge);
    const ok = await verifySignature({ message, signature, address: addr });
    if (!ok) {
      return Response.json(
        { verified: false, error: "Signature does not match this address" },
        { status: 401 },
      );
    }

    // Sign the session before consuming, so a misconfigured secret doesn't
    // burn the user's challenge.
    const session = issueSession(addr);

    const fresh = await consumeNonce({
      nonce: check.challenge.nonce,
      address: addr,
      message,
      issuedAt: check.challenge.issuedAt,
      expiresAt: check.challenge.expiresAt,
    });
    if (!fresh) {
      return Response.json(
        { verified: false, error: "Challenge already used. Start again." },
        { status: 409 },
      );
    }

    return Response.json({ verified: true, ...session });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return Response.json({ verified: false, error: message }, { status: 500 });
  }
}
