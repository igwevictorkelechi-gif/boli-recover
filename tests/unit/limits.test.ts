import { describe, expect, it, vi } from "vitest";
import { rateLimit } from "@/lib/rateLimit";
import { consumeNonce } from "@/lib/nonceStore";

describe("rateLimit", () => {
  it("allows up to the limit per IP, then 429s", async () => {
    const req = (ip: string) =>
      new Request("http://x", { headers: { "x-forwarded-for": ip } });
    for (let i = 0; i < 3; i++)
      expect(rateLimit(req("1.1.1.1"), "t", 3, 60_000)).toBeNull();
    const blocked = rateLimit(req("1.1.1.1"), "t", 3, 60_000);
    expect(blocked?.status).toBe(429);
    expect(rateLimit(req("2.2.2.2"), "t", 3, 60_000)).toBeNull();
  });
});

describe("nonce store (in-memory)", () => {
  it("consumes a nonce once", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const n = {
      nonce: "abc" + Math.random(),
      address: "0x1",
      message: "m",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(await consumeNonce(n)).toBe(true);
    expect(await consumeNonce(n)).toBe(false);
    vi.unstubAllEnvs();
  });
});
