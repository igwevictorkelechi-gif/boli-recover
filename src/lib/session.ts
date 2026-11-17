import { randomBytes } from "crypto";
import { getAddress, isAddress, type Address } from "viem";
import { hmac, safeEqual } from "./secret";

// Short-lived proof that an address passed the ownership check.
//
// A compact HS256 JWT signed with SESSION_SECRET. Issued by /api/verify after a
// signature checks out; required by /api/transfer before the server will build
// a transaction for that address. Server-only — never import into a client
// component (it reads the secret).
//
// The token proves "this browser session proved control of address X a few
// minutes ago". It is not a key and cannot move funds: every transaction is
// still signed by the user's own wallet.

const SESSION_TTL_SECONDS = 15 * 60;
const ISSUER = "boli-recover";
const AUDIENCE = "boli-recover:transfer";
// The only header we ever issue or accept. Comparing the exact encoded header
// rules out "alg: none" and algorithm-confusion tricks.
const HEADER_B64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export type SessionClaims = {
  iss: string;
  aud: string;
  sub: string; // checksummed owner address
  iat: number;
  exp: number;
  jti: string;
};

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): Buffer {
  return hmac("session", data);
}

export function issueSession(address: Address): {
  token: string;
  expiresAt: string;
} {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: getAddress(address),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
  };
  const body = `${HEADER_B64}.${b64url(JSON.stringify(claims))}`;
  const token = `${body}.${sign(body).toString("base64url")}`;
  return { token, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

// Returns the verified owner address, or null for any token that is malformed,
// forged, expired, or issued for something else.
export function verifySession(
  token: string | null | undefined,
): Address | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  if (header !== HEADER_B64) return null;

  const expected = sign(`${header}.${payload}`);
  const given = Buffer.from(sig, "base64url");
  if (!safeEqual(given, expected)) return null;

  let claims: Partial<SessionClaims>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) return null;
  if (typeof claims.exp !== "number" || claims.exp <= now) return null;
  if (typeof claims.sub !== "string" || !isAddress(claims.sub)) return null;
  return getAddress(claims.sub);
}

// Pulls the token out of an `Authorization: Bearer <token>` header.
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}
