import { formatUnits, getAddress, type Address } from "viem";
import type { AssetBalance } from "./scan";
import { checkTokenSpam } from "./spam";

// Full ERC-20 coverage via the Alchemy Token API. Returns every token an
// address holds on a chain — not just a curated list. When ALCHEMY_API_KEY is
// unset, or the chain isn't mapped here, callers fall back to the curated
// multicall in scan.ts.
//
// Confirm your Alchemy plan covers these networks; slugs can vary by tier.
const ALCHEMY_NETWORKS: Record<number, string> = {
  1: "eth-mainnet",
  56: "bnb-mainnet",
  137: "polygon-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
  8453: "base-mainnet",
  43114: "avax-mainnet",
};

type RpcResponse = { id?: number; result?: unknown; error?: { message?: string } };

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Alchemy ${method} HTTP ${res.status}`);
  const json = (await res.json()) as RpcResponse;
  if (json.error) throw new Error(json.error.message ?? "Alchemy RPC error");
  return json.result;
}

// One HTTP request, many metadata lookups. Responses can come back out of
// order, so we reorder by id.
async function rpcBatch(
  url: string,
  calls: { method: string; params: unknown[] }[],
): Promise<unknown[]> {
  if (calls.length === 0) return [];
  const body = calls.map((c, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: c.method,
    params: c.params,
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alchemy batch HTTP ${res.status}`);
  const json = (await res.json()) as RpcResponse[];
  const byId = new Map<number, unknown>();
  for (const r of json) if (typeof r.id === "number") byId.set(r.id, r.result);
  return calls.map((_, i) => byId.get(i));
}

type TokenBalanceEntry = { contractAddress: string; tokenBalance: string | null };
type TokenMetadata = {
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
};

export function alchemySupports(chainId: number): boolean {
  return Boolean(process.env.ALCHEMY_API_KEY) && chainId in ALCHEMY_NETWORKS;
}

// Returns token balances, or null to signal "not configured — use fallback".
// An empty array means "configured, and the address holds no tokens here".
export async function scanTokensViaAlchemy(
  chainId: number,
  address: Address,
): Promise<AssetBalance[] | null> {
  const key = process.env.ALCHEMY_API_KEY;
  const net = ALCHEMY_NETWORKS[chainId];
  if (!key || !net) return null;
  const url = `https://${net}.g.alchemy.com/v2/${key}`;

  try {
    // 1. Collect non-zero balances, paging up to a cap.
    const nonZero: { contractAddress: string; balance: bigint }[] = [];
    let pageKey: string | undefined;
    for (let page = 0; page < 5; page++) {
      const params = pageKey
        ? [address, "erc20", { pageKey }]
        : [address, "erc20"];
      const result = (await rpc(url, "alchemy_getTokenBalances", params)) as {
        tokenBalances?: TokenBalanceEntry[];
        pageKey?: string;
      };
      for (const t of result?.tokenBalances ?? []) {
        if (t.tokenBalance && BigInt(t.tokenBalance) > 0n) {
          nonZero.push({
            contractAddress: t.contractAddress,
            balance: BigInt(t.tokenBalance),
          });
        }
      }
      pageKey = result?.pageKey;
      if (!pageKey) break;
    }
    if (nonZero.length === 0) return [];

    // 2. Metadata for each, in a single batched request.
    const metas = (await rpcBatch(
      url,
      nonZero.map((t) => ({
        method: "alchemy_getTokenMetadata",
        params: [t.contractAddress],
      })),
    )) as (TokenMetadata | undefined)[];

    const assets: AssetBalance[] = [];
    nonZero.forEach((t, i) => {
      const meta = metas[i];
      // Skip tokens we can't decode (no symbol / decimals) — usually spam, and
      // without decimals we can't show an amount anyway.
      if (!meta || meta.decimals == null || !meta.symbol) return;
      const decimals = Number(meta.decimals);
      const spam = checkTokenSpam(meta);
      assets.push({
        kind: "token",
        symbol: meta.symbol,
        name: meta.name ?? undefined,
        spam: spam.spam,
        spamReason: spam.reason,
        decimals,
        address: getAddress(t.contractAddress),
        raw: t.balance.toString(),
        formatted: formatUnits(t.balance, decimals),
      });
    });
    return assets;
  } catch {
    // Any failure → signal fallback rather than failing the whole scan.
    return null;
  }
}
