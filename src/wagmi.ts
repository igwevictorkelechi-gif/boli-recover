import { http, createConfig } from "wagmi";
import {
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
  avalanche,
} from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Client-side wagmi config for connecting a wallet and executing the move.
// Injected (MetaMask / browser wallets) works with no extra config. To add
// WalletConnect for mobile wallets, install it and uncomment below.
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
