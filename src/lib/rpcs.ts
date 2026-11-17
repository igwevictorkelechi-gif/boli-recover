// Free public RPCs, tried in order. Any single public endpoint rate-limits or
// goes down now and then; a fallback list keeps the scan working. For
// production traffic set RPC_<chainId> to a keyed provider — it goes first.
export const PUBLIC_RPCS: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  56: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org"],
  137: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
  42161: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
  ],
  10: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
  8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  43114: [
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://api.avax.network/ext/bc/C/rpc",
  ],
};
