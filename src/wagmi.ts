// `injected` comes from wagmi's root export, not "wagmi/connectors": that
// barrel also pulls in the Coinbase/Base SDK, whose optional x402 packages
// aren't installed and break `next build`.
import { http, fallback, createConfig, injected } from "wagmi";
import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
} from "wagmi/chains";
import { PUBLIC_RPCS } from "@/lib/rpcs";

// Client-side wagmi config for connecting a wallet and executing the move.
//
// Wallets: every browser wallet that announces itself (EIP-6963 — MetaMask,
// Rabby, Trust, Coinbase extension, …) shows up by name, plus a generic
// injected fallback. On mobile, users open the site in their wallet app's
// built-in browser, which injects the same way.
//
// Transports: the browser only reads chain data to watch for the receipt;
// sending always goes through the wallet itself.
const chains = [
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
] as const;

function transport(chainId: number) {
  const urls = PUBLIC_RPCS[chainId] ?? [];
  return urls.length ? fallback([...urls.map((u) => http(u)), http()]) : http();
}

export const config = createConfig({
  chains,
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [mainnet.id]: transport(mainnet.id),
    [bsc.id]: transport(bsc.id),
    [polygon.id]: transport(polygon.id),
    [arbitrum.id]: transport(arbitrum.id),
    [optimism.id]: transport(optimism.id),
    [base.id]: transport(base.id),
    [avalanche.id]: transport(avalanche.id),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
