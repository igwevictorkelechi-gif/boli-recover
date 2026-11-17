import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
  type Chain,
} from "viem/chains";

// The EVM chains we scan. Same address + key controls the address on every one
// of these, which is exactly why funds get "stuck" on the wrong one.
export const SCAN_CHAINS: Chain[] = [
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
];

export const CHAIN_BY_ID: Record<number, Chain> = Object.fromEntries(
  SCAN_CHAINS.map((c) => [c.id, c]),
);

// Optional per-chain RPC override from env (RPC_<chainId>). Falls back to the
// chain's built-in public RPC when unset.
export function rpcUrlFor(chainId: number): string | undefined {
  return process.env[`RPC_${chainId}`];
}
