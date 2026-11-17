// `injected` comes from wagmi's root export, not "wagmi/connectors": that
// barrel also pulls in the Coinbase/Base SDK, whose optional x402 packages
// aren't installed and break `next build`.
import { http, createConfig, injected } from "wagmi";
import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
} from "wagmi/chains";

// Client-side wagmi config for connecting a wallet and executing the move.
// Injected (MetaMask / browser wallets) works with no extra config. To add
// WalletConnect for mobile wallets, install it and import `walletConnect` from
// "wagmi/connectors" (and check `next build` still passes).
export const config = createConfig({
  chains: [mainnet, bsc, polygon, arbitrum, optimism, base, avalanche],
  connectors: [
    injected(),
    // walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID! }),
  ],
  transports: {
    [mainnet.id]: http(),
    [bsc.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [avalanche.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
