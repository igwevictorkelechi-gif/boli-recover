import {
  createPublicClient,
  http,
  formatUnits,
  erc20Abi,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import { SCAN_CHAINS, rpcUrlFor } from "./chains";
import { CURATED_TOKENS } from "./tokens";
import { scanTokensViaAlchemy } from "./indexer";

export type AssetBalance = {
  kind: "native" | "token";
  symbol: string;
  decimals: number;
  address?: Address; // token contract (absent for native)
  raw: string; // balance as a base-unit integer string (BigInt-safe over JSON)
  formatted: string; // human-readable
};

export type ChainResult = {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  hasGas: boolean; // native balance > 0 — needed to pay for moving tokens out
  assets: AssetBalance[];
};

const clients = new Map<number, PublicClient>();

function clientFor(chain: Chain): PublicClient {
  if (!clients.has(chain.id)) {
    const url = rpcUrlFor(chain.id);
    clients.set(
      chain.id,
      createPublicClient({ chain, transport: http(url) }) as PublicClient,
    );
  }
  return clients.get(chain.id)!;
}

async function nativeBalance(
  client: PublicClient,
  chain: Chain,
  address: Address,
): Promise<AssetBalance | null> {
  try {
    const native = await client.getBalance({ address });
    if (native <= 0n) return null;
    return {
      kind: "native",
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
      raw: native.toString(),
      formatted: formatUnits(native, chain.nativeCurrency.decimals),
    };
  } catch {
    return null;
  }
}

// Fallback used when no indexer is configured for this chain: check a small
// curated token list via multicall.
async function curatedTokens(
  client: PublicClient,
  chainId: number,
  address: Address,
): Promise<AssetBalance[]> {
  const tokens = CURATED_TOKENS[chainId] ?? [];
  if (tokens.length === 0) return [];
  try {
    const res = await client.multicall({
      contracts: tokens.map((t) => ({
        address: t.address,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [address] as const,
      })),
    });
    const out: AssetBalance[] = [];
    res.forEach((r, i) => {
      if (r.status === "success") {
        const bal = r.result as bigint;
        if (bal > 0n) {
          const t = tokens[i];
          out.push({
            kind: "token",
            symbol: t.symbol,
            decimals: t.decimals,
            address: t.address,
            raw: bal.toString(),
            formatted: formatUnits(bal, t.decimals),
          });
        }
      }
    });
    return out;
  } catch {
    return [];
  }
}

async function scanChain(chain: Chain, address: Address): Promise<ChainResult> {
  const client = clientFor(chain);

  // Native + tokens in parallel. Tokens prefer the indexer (any ERC-20) and
  // fall back to the curated multicall when the indexer isn't configured.
  const [native, indexed] = await Promise.all([
    nativeBalance(client, chain, address),
    scanTokensViaAlchemy(chain.id, address),
  ]);

  const tokenAssets =
    indexed ?? (await curatedTokens(client, chain.id, address));

  const assets: AssetBalance[] = [];
  if (native) assets.push(native);
  assets.push(...tokenAssets);

  return {
    chainId: chain.id,
    chainName: chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    hasGas: native !== null,
    assets,
  };
}

export async function scanAddress(address: Address): Promise<ChainResult[]> {
  const results = await Promise.all(
    SCAN_CHAINS.map((chain) => scanChain(chain, address)),
  );
  return results.filter((r) => r.assets.length > 0);
}
