import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bearerToken, issueSession, verifySession } from "@/lib/session";

const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("session token", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", "x".repeat(40)));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("round-trips the owner address", () => {
    const { token, expiresAt } = issueSession(ADDR);
    expect(verifySession(token)).toBe(ADDR);
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
  });

  it("rejects a tampered payload", () => {
    const [h, p, s] = issueSession(ADDR).token.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    claims.sub = "0x0000000000000000000000000000000000000001";
    const forged = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect(verifySession(`${h}.${forged}.${s}`)).toBeNull();
  });

  it("rejects alg=none and garbage", () => {
    const [, p] = issueSession(ADDR).token.split(".");
    const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString(
      "base64url",
    );
    expect(verifySession(`${none}.${p}.`)).toBeNull();
    expect(verifySession("garbage")).toBeNull();
    expect(verifySession(null)).toBeNull();
  });

  it("rejects a token signed with another secret", () => {
    const { token } = issueSession(ADDR);
    vi.stubEnv("SESSION_SECRET", "y".repeat(40));
    expect(verifySession(token)).toBeNull();
  });

  it("expires after 15 minutes", () => {
    vi.useFakeTimers();
    const { token } = issueSession(ADDR);
    vi.advanceTimersByTime(14 * 60_000);
    expect(verifySession(token)).toBe(ADDR);
    vi.advanceTimersByTime(2 * 60_000);
    expect(verifySession(token)).toBeNull();
  });

  it("refuses to sign without a strong secret", () => {
    vi.stubEnv("SESSION_SECRET", "short");
    expect(() => issueSession(ADDR)).toThrow(/SESSION_SECRET/);
  });

  it("reads bearer tokens", () => {
    const req = new Request("http://x", {
      headers: { authorization: "Bearer abc" },
    });
    expect(bearerToken(req)).toBe("abc");
    expect(bearerToken(new Request("http://x"))).toBeNull();
  });
});
