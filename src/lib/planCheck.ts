import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import type { TransferPlan } from "./transfer";

// Client-safe helpers for the move step (no server imports).

export type Intent = {
  owner: Address;
  chainId: number;
  asset: { kind: "native" } | { kind: "token"; address: Address };
  destination: Address;
  requested: bigint | "max";
};

// Defence in depth: the server builds the transaction, but before the wallet
// is asked to sign it we check it does exactly what the user typed — right
// network, sender, asset, destination and amount. Returns the name of the
// first mismatch, or null if the plan is faithful.
export function planMismatch(plan: TransferPlan, o: Intent): string | null {
  if (plan.chainId !== o.chainId) return "network";
  if (getAddress(plan.from) !== getAddress(o.owner)) return "sender";
  const value = BigInt(plan.tx.value);

  if (o.asset.kind === "native") {
    if (plan.tx.data && plan.tx.data !== "0x") return "call data";
    if (getAddress(plan.tx.to) !== getAddress(o.destination))
      return "destination";
    if (value.toString() !== plan.amount.raw) return "amount";
    if (o.requested !== "max" && value !== o.requested) return "amount";
    return null;
  }

  if (value !== 0n) return "value";
  if (getAddress(plan.tx.to) !== getAddress(o.asset.address))
    return "token contract";
  try {
    const call = decodeFunctionData({
      abi: erc20Abi,
      data: plan.tx.data as Hex,
    });
    if (call.functionName !== "transfer") return "function";
    const [to, amount] = call.args as readonly [Address, bigint];
    if (getAddress(to) !== getAddress(o.destination)) return "destination";
    if (amount.toString() !== plan.amount.raw) return "amount";
    if (o.requested !== "max" && amount !== o.requested) return "amount";
  } catch {
    return "call data";
  }
  return null;
}

// "Send at least 0.000069929725864464 ETH" is hard to act on. Round UP to two
// significant figures (0.00007) so following the instruction always covers it.
export function roundUpForHumans(raw: string, decimals: number): string {
  const v = BigInt(raw);
  if (v <= 0n) return "0";
  const digits = v.toString().length;
  if (digits <= 2) return formatUnits(v, decimals);
  const unit = 10n ** BigInt(digits - 2);
  const rounded = ((v + unit - 1n) / unit) * unit;
  return formatUnits(rounded, decimals);
}

// Readable balance: thousands separators, at most `maxFraction` decimals,
// truncated (never rounded up). Dust shows as "<0.000001" rather than "0".
export function displayAmount(formatted: string, maxFraction = 6): string {
  const [int, frac = ""] = formatted.split(".");
  const intPretty = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = frac.slice(0, maxFraction).replace(/0+$/, "");
  if (int === "0" && !f && /[1-9]/.test(frac)) {
    return `<0.${"0".repeat(maxFraction - 1)}1`;
  }
  return f ? `${intPretty}.${f}` : intPretty;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
