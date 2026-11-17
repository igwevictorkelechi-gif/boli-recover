import {
  createPublicClient,
  fallback,
  http,
  type PublicClient,
  type Transport,
} from "viem";
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
import { PUBLIC_RPCS } from "./rpcs";

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

// RPC_<chainId> may hold one URL or a comma-separated list.
export function rpcUrlsFor(chainId: number): string[] {
  const override = process.env[`RPC_${chainId}`];
  const custom = override
    ? override
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return [...custom, ...(PUBLIC_RPCS[chainId] ?? [])];
}

function transportFor(chain: Chain): Transport {
  const urls = rpcUrlsFor(chain.id);
  const opts = { timeout: 10_000, retryCount: 1 };
  if (urls.length === 0) return http(undefined, opts); // viem's chain default
  if (urls.length === 1) return http(urls[0], opts);
  return fallback(
    urls.map((u) => http(u, opts)),
    { retryCount: 0 },
  );
}

const clients = new Map<number, PublicClient>();

// One cached public client per chain, shared by the scan and the transfer
// builder. Server-side only (reads RPC_<chainId> from the environment).
export function clientFor(chain: Chain): PublicClient {
  let client = clients.get(chain.id);
  if (!client) {
    client = createPublicClient({
      chain,
      transport: transportFor(chain),
    }) as PublicClient;
    clients.set(chain.id, client);
  }
  return client;
}

export function explorerFor(chainId: number): string | undefined {
  return CHAIN_BY_ID[chainId]?.blockExplorers?.default.url;
}
