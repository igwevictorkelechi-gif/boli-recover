import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildChallengeMessage,
  issueChallenge,
  readChallenge,
  verifySignature,
} from "@/lib/ownership";
import { issueSession, verifySession } from "@/lib/session";

// Throwaway key generated per run — test-only.
const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());

describe("ownership challenge", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", "s".repeat(40)));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("message is explicit that it authorizes nothing, and names the site", () => {
    const { message } = issueChallenge(account.address, "recover.example");
    expect(message).toContain("recover.example");
    expect(message).toContain(account.address);
    expect(message).toMatch(/authorizes no transaction, moves no funds/);
    expect(message).toMatch(/never ask for your seed phrase/);
  });

  it("verifies a real wallet signature over the rebuilt message", async () => {
    const { challenge, message } = issueChallenge(account.address, "x.test");
    const check = readChallenge(challenge, account.address);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const rebuilt = buildChallengeMessage(check.challenge);
    expect(rebuilt).toBe(message);
    const signature = await account.signMessage({ message });
    expect(
      await verifySignature({
        message: rebuilt,
        signature,
        address: account.address,
      }),
    ).toBe(true);
  });

  it("rejects a signature from a different key", async () => {
    const { message } = issueChallenge(account.address, "x.test");
    const signature = await other.signMessage({ message });
    expect(
      await verifySignature({ message, signature, address: account.address }),
    ).toBe(false);
  });

  it("rejects tampering, wrong address and expiry", () => {
    const { challenge } = issueChallenge(account.address, "x.test");
    const [p, s] = challenge.split(".");
    const c = JSON.parse(Buffer.from(p, "base64url").toString());
    c.address = other.address;
    const forged = Buffer.from(JSON.stringify(c)).toString("base64url");
    expect(readChallenge(`${forged}.${s}`, other.address).ok).toBe(false);
    expect(readChallenge(challenge, other.address).ok).toBe(false);

    vi.useFakeTimers();
    const fresh = issueChallenge(account.address, "x.test").challenge;
    vi.advanceTimersByTime(11 * 60_000);
    expect(readChallenge(fresh, account.address).ok).toBe(false);
  });

  it("a challenge token can't be used as a session token (separate keys)", () => {
    const { challenge } = issueChallenge(account.address, "x.test");
    expect(verifySession(challenge)).toBeNull();
    const { token } = issueSession(account.address);
    expect(readChallenge(token, account.address).ok).toBe(false);
  });
});
