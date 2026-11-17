import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { displayAmount, planMismatch, roundUpForHumans } from "@/lib/planCheck";
import type { TransferPlan } from "@/lib/transfer";

const OWNER = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1" as const;
const DEST = "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0" as const;
const EVIL = "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b" as const;
const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;

function tokenPlan(
  to: string,
  amount: bigint,
  over: Partial<TransferPlan> = {},
): TransferPlan {
  const amt = { raw: amount.toString(), formatted: "x", symbol: "USDT" };
  return {
    chainId: 1,
    chainName: "Ethereum",
    from: OWNER,
    tx: {
      to: TOKEN,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, amount],
      }),
      value: "0",
      gas: "60000",
    },
    amount: amt,
    fee: { ...amt, symbol: "ETH", estimated: true },
    nativeBalance: { ...amt, symbol: "ETH" },
    shortfall: null,
    warnings: [],
    ...over,
  };
}

const intent = {
  owner: OWNER,
  chainId: 1,
  asset: { kind: "token" as const, address: TOKEN as `0x${string}` },
  destination: DEST as `0x${string}`,
  requested: 5n as bigint | "max",
};

describe("planMismatch", () => {
  it("accepts a faithful plan", () => {
    expect(planMismatch(tokenPlan(DEST, 5n), intent)).toBeNull();
    expect(
      planMismatch(tokenPlan(DEST, 9n), { ...intent, requested: "max" }),
    ).toBeNull();
  });

  it("catches a swapped destination inside the calldata", () => {
    expect(planMismatch(tokenPlan(EVIL, 5n), intent)).toBe("destination");
  });

  it("catches a changed amount, network, sender, or value", () => {
    expect(planMismatch(tokenPlan(DEST, 6n), intent)).toBe("amount");
    expect(planMismatch(tokenPlan(DEST, 5n, { chainId: 56 }), intent)).toBe(
      "network",
    );
    expect(planMismatch(tokenPlan(DEST, 5n, { from: EVIL }), intent)).toBe(
      "sender",
    );
    const p = tokenPlan(DEST, 5n);
    p.tx.value = "1";
    expect(planMismatch(p, intent)).toBe("value");
  });

  it("catches an approve() dressed up as a transfer", () => {
    const p = tokenPlan(DEST, 5n);
    p.tx.data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [DEST, 5n],
    });
    expect(planMismatch(p, intent)).toBe("function");
  });

  it("checks native sends", () => {
    const native = {
      ...tokenPlan(DEST, 0n),
      tx: { to: DEST as `0x${string}`, value: "7", gas: "21000" },
      amount: { raw: "7", formatted: "x", symbol: "ETH" },
    };
    const ni = {
      ...intent,
      asset: { kind: "native" as const },
      requested: 7n as bigint | "max",
    };
    expect(planMismatch(native, ni)).toBeNull();
    expect(
      planMismatch({ ...native, tx: { ...native.tx, to: EVIL } }, ni),
    ).toBe("destination");
    expect(
      planMismatch({ ...native, tx: { ...native.tx, data: "0x1234" } }, ni),
    ).toBe("call data");
  });
});

describe("number display", () => {
  it("rounds shortfalls up to two significant figures", () => {
    expect(roundUpForHumans("69929725864464", 18)).toBe("0.00007");
    expect(roundUpForHumans("1000000000000000000", 18)).toBe("1");
    expect(roundUpForHumans("1010000000000000001", 18)).toBe("1.1");
  });

  it("formats balances without rounding up", () => {
    expect(displayAmount("1234567.123456789")).toBe("1,234,567.123456");
    expect(displayAmount("250")).toBe("250");
    expect(displayAmount("0.000000000000000001")).toBe("<0.000001");
    expect(displayAmount("0.10")).toBe("0.1");
  });
});
