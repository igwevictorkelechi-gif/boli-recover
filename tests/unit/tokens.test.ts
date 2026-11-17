import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { CURATED_TOKENS_RAW } from "@/lib/tokens";
import { SCAN_CHAINS } from "@/lib/chains";

describe("curated token list", () => {
  const entries = Object.entries(CURATED_TOKENS_RAW).flatMap(([chain, list]) =>
    list.map(([address, symbol]) => ({ chain, address, symbol })),
  );

  it.each(entries)(
    "$symbol on chain $chain has a valid checksum",
    ({ address }) => {
      // A wrong checksum is the usual sign of a mistyped address.
      expect(getAddress(address.toLowerCase())).toBe(address);
    },
  );

  // Chains where only the native coin is scanned until token addresses are
  // verified on-chain. Every other chain must have curated tokens.
  const NATIVE_ONLY = new Set<number>([]);

  it("covers every scanned chain, with no duplicates per chain", () => {
    for (const chain of SCAN_CHAINS) {
      const list = CURATED_TOKENS_RAW[chain.id];
      expect(list, chain.name).toBeDefined();
      if (!NATIVE_ONLY.has(chain.id)) {
        expect(list.length, chain.name).toBeGreaterThan(0);
      }
      const lower = list.map(([a]) => a.toLowerCase());
      expect(new Set(lower).size).toBe(lower.length);
    }
  });
});
