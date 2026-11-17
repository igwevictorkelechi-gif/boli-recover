import type { Address } from "viem";

export type TokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
};

// Minimal, high-confidence curated list so the scan finds the most common
// stuck stablecoins with zero configuration.
//
// This is deliberately small. For production coverage of ANY ERC-20, plug in
// an indexer (Alchemy `alchemy_getTokenBalances`, Covalent, or Moralis) in
// scan.ts — see the note there. The curated list is the no-API-key fallback.
export const CURATED_TOKENS: Record<number, TokenInfo[]> = {
  // Ethereum
  1: [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
  ],
  // BNB Smart Chain — the single most common place funds land by mistake
  56: [
    { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 },
    { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", symbol: "BUSD", decimals: 18 },
    { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18 },
  ],
};
