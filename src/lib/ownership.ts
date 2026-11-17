import { randomBytes } from "crypto";
import {
  getAddress,
  isAddress,
  recoverMessageAddress,
  type Address,
} from "viem";
import { hmac, safeEqual } from "./secret";

// Ownership challenge: "sign this harmless message to prove you hold the key".
//
// Stateless: the server hands back a signed challenge token alongside the
// message, and rebuilds the exact message from that token at verify time — so
// no database is needed and the client can't swap in a different message.
// Replays are stopped by the nonce store (see nonceStore.ts).

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export type Challenge = {
  address: Address;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  domain: string;
};

// Plain, explicit wording: the user (and their wallet's phishing warnings) can
// see this signature moves nothing. The domain lets them spot a look-alike site.
export function buildChallengeMessage(c: Challenge): string {
  return [
    `${c.domain} wants you to prove you control this wallet.`,
    "",
    "Boli Recover — ownership check",
    `Address: ${c.address}`,
    `Nonce: ${c.nonce}`,
    `Issued: ${c.issuedAt}`,
    `Expires: ${c.expiresAt}`,
    "",
    "Signing proves you control this wallet.",
    "It authorizes no transaction, moves no funds, and costs no gas.",
    "Boli Recover will never ask for your seed phrase or private key.",
  ].join("\n");
}

export function issueChallenge(
  address: Address,
  domain: string,
): { message: string; challenge: string; expiresAt: string } {
  const now = Date.now();
  const c: Challenge = {
    address: getAddress(address),
    nonce: randomBytes(16).toString("hex"),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString(),
    domain,
  };
  const payload = Buffer.from(JSON.stringify(c)).toString("base64url");
  const sig = hmac("challenge", payload).toString("base64url");
  return {
    message: buildChallengeMessage(c),
    challenge: `${payload}.${sig}`,
    expiresAt: c.expiresAt,
  };
}

export type ChallengeCheck =
  | { ok: true; challenge: Challenge }
  | { ok: false; reason: string };

// Validates the token's signature, expiry and address. Does NOT check the
// wallet signature — see verifyOwnership.
export function readChallenge(
  token: string,
  expectedAddress: Address,
): ChallengeCheck {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) {
    return { ok: false, reason: "Malformed challenge. Start again." };
  }
  if (!safeEqual(Buffer.from(sig, "base64url"), hmac("challenge", payload))) {
    return { ok: false, reason: "Invalid challenge. Start again." };
  }
  let c: Challenge;
  try {
    c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Malformed challenge. Start again." };
  }
  if (
    !isAddress(c.address) ||
    getAddress(c.address) !== getAddress(expectedAddress)
  ) {
    return {
      ok: false,
      reason: "This challenge was issued for a different address.",
    };
  }
  if (!(Date.parse(c.expiresAt) > Date.now())) {
    return { ok: false, reason: "The challenge expired. Start again." };
  }
  return { ok: true, challenge: c };
}

// Recover the signer and confirm it matches the claimed address. The private
// key never leaves the user's wallet.
export async function verifySignature(o: {
  message: string;
  signature: `0x${string}`;
  address: Address;
}): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: o.message,
      signature: o.signature,
    });
    return getAddress(recovered) === getAddress(o.address);
  } catch {
    return false;
  }
}
