import {
  formatUnits,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import { SCAN_CHAINS, clientFor } from "./chains";
import { CURATED_TOKENS, type TokenInfo } from "./tokens";
import { scanTokensViaAlchemy } from "./indexer";

export type AssetBalance = {
  kind: "native" | "token";
  symbol: string;
  name?: string;
  decimals: number;
  address?: Address; // token contract (absent for native)
  raw: string; // balance as a base-unit integer string (BigInt-safe over JSON)
  formatted: string; // human-readable
  spam?: boolean; // likely an unsolicited advert token — hidden by default
  spamReason?: string;
};

export type ChainResult = {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  hasGas: boolean; // native balance > 0 — needed to pay for moving tokens out
  assets: AssetBalance[];
  // Set when (part of) this chain couldn't be checked. The UI must never
  // present "couldn't check" as "nothing here".
  error?: string;
  tokenSource: "indexer" | "curated";
};

const CHAIN_TIMEOUT_MS = 20_000;

// Extra tokens to check per chain, from TOKENS_<chainId>=0xabc,0xdef.
// Lets an operator cover a token the curated list misses without a deploy.
function extraTokens(chainId: number): TokenInfo[] {
  const raw = process.env[`TOKENS_${chainId}`];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isAddress(s, { strict: false }))
    .map((s) => ({
      address: getAddress(s.toLowerCase()),
      symbol: "?",
      decimals: 18,
    }));
}

function tokensFor(chainId: number): TokenInfo[] {
  const seen = new Set<string>();
  const out: TokenInfo[] = [];
  for (const t of [
    ...(CURATED_TOKENS[chainId] ?? []),
    ...extraTokens(chainId),
  ]) {
    if (seen.has(t.address)) continue;
    seen.add(t.address);
    out.push(t);
  }
  return out;
}

async function nativeBalance(
  client: PublicClient,
  chain: Chain,
  address: Address,
): Promise<bigint> {
  return client.getBalance({ address });
}

type Read = { ok: true; value: unknown } | { ok: false };

// balanceOf for every token in one multicall. Falls back to individual calls
// if the chain/RPC can't do multicall (no Multicall3, or a picky RPC).
async function readBalances(
  client: PublicClient,
  tokens: TokenInfo[],
  address: Address,
): Promise<Read[]> {
  const contracts = tokens.map((t) => ({
    address: t.address,
    abi: erc20Abi,
    functionName: "balanceOf" as const,
    args: [address] as const,
  }));
  try {
    const res = await client.multicall({ contracts });
    // Every call "failing" means the multicall itself didn't work (e.g. no
    // Multicall3 on this chain/RPC) — not that the address holds nothing.
    if (res.length > 0 && res.every((r) => r.status !== "success")) {
      throw new Error("multicall unavailable");
    }
    return res.map((r) =>
      r.status === "success" ? { ok: true, value: r.result } : { ok: false },
    );
  } catch {
    const res = await Promise.allSettled(
      contracts.map((c) => client.readContract(c)),
    );
    if (res.every((r) => r.status === "rejected")) {
      throw new Error("token balance reads failed");
    }
    return res.map((r) =>
      r.status === "fulfilled" ? { ok: true, value: r.value } : { ok: false },
    );
  }
}

// symbol + decimals straight from the contract, so a wrong curated entry can
// never mis-scale an amount. Only called for tokens with a balance.
async function readMeta(
  client: PublicClient,
  token: TokenInfo,
): Promise<{ symbol: string; decimals: number }> {
  const [sym, dec] = await Promise.allSettled([
    client.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    client.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  return {
    symbol:
      sym.status === "fulfilled" && sym.value
        ? String(sym.value)
        : token.symbol,
    decimals: dec.status === "fulfilled" ? Number(dec.value) : token.decimals,
  };
}

async function curatedTokens(
  client: PublicClient,
  chainId: number,
  address: Address,
): Promise<AssetBalance[]> {
  const tokens = tokensFor(chainId);
  if (tokens.length === 0) return [];
  const balances = await readBalances(client, tokens, address);

  const held = tokens
    .map((t, i) => ({ t, r: balances[i] }))
    .filter(
      (x): x is { t: TokenInfo; r: { ok: true; value: bigint } } =>
        x.r.ok && typeof x.r.value === "bigint" && x.r.value > 0n,
    );

  return Promise.all(
    held.map(async ({ t, r }) => {
      const meta = await readMeta(client, t);
      return {
        kind: "token" as const,
        symbol: meta.symbol,
        decimals: meta.decimals,
        address: t.address,
        raw: r.value.toString(),
        formatted: formatUnits(r.value, meta.decimals),
      };
    }),
  );
}

async function scanChainInner(
  chain: Chain,
  address: Address,
): Promise<ChainResult> {
  const client = clientFor(chain);

  // Native + tokens in parallel. Tokens prefer the indexer (any ERC-20) and
  // fall back to the curated list when the indexer isn't configured/fails.
  const [native, indexed] = await Promise.allSettled([
    nativeBalance(client, chain, address),
    scanTokensViaAlchemy(chain.id, address),
  ]);

  const errors: string[] = [];
  const assets: AssetBalance[] = [];

  const nativeBal = native.status === "fulfilled" ? native.value : null;
  if (nativeBal === null) errors.push(`${chain.nativeCurrency.symbol} balance`);
  if (nativeBal !== null && nativeBal > 0n) {
    assets.push({
      kind: "native",
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
      raw: nativeBal.toString(),
      formatted: formatUnits(nativeBal, chain.nativeCurrency.decimals),
    });
  }

  let tokenSource: ChainResult["tokenSource"] = "curated";
  const fromIndexer = indexed.status === "fulfilled" ? indexed.value : null;
  if (fromIndexer) {
    tokenSource = "indexer";
    assets.push(...fromIndexer);
  } else {
    try {
      assets.push(...(await curatedTokens(client, chain.id, address)));
    } catch {
      errors.push("token balances");
    }
  }

  return {
    chainId: chain.id,
    chainName: chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    hasGas: nativeBal !== null && nativeBal > 0n,
    assets,
    tokenSource,
    error: errors.length
      ? `Couldn't check ${errors.join(" and ")} — the network didn't respond. Try again.`
      : undefined,
  };
}

async function scanChain(chain: Chain, address: Address): Promise<ChainResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ChainResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          chainId: chain.id,
          chainName: chain.name,
          nativeSymbol: chain.nativeCurrency.symbol,
          hasGas: false,
          assets: [],
          tokenSource: "curated",
          error: "The network took too long to respond. Try again.",
        }),
      CHAIN_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([scanChainInner(chain, address), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// Every supported chain comes back — with assets, empty, or with an error —
// so the UI can say exactly what was and wasn't checked.
export async function scanAddress(address: Address): Promise<ChainResult[]> {
  return Promise.all(SCAN_CHAINS.map((chain) => scanChain(chain, address)));
}
