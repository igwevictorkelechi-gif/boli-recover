import { getAddress, type Address } from "viem";

export type TokenInfo = {
  address: Address;
  symbol: string; // display fallback; the scan reads symbol/decimals on-chain
  decimals: number;
};

// Curated tokens checked on every scan when no indexer (ALCHEMY_API_KEY) is
// configured: the assets people most often send over the wrong network —
// stablecoins, wrapped majors, and big bridged/pegged tokens.
//
// Addresses are written checksummed; the test suite fails if any checksum is
// wrong (the usual sign of a typo). Symbol and decimals here are only a
// fallback — the scan reads both from the contract so amounts are never
// mis-scaled by a bad entry.
const RAW: Record<number, [string, string, number][]> = {
  // Ethereum
  1: [
    ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "USDT", 6],
    ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "USDC", 6],
    ["0x6B175474E89094C44Da98b954EedeAC495271d0F", "DAI", 18],
    ["0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", "PYUSD", 6],
    ["0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", "FDUSD", 18],
    ["0x0000000000085d4780B73119b644AE5ecd22b376", "TUSD", 18],
    ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "WETH", 18],
    ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", "WBTC", 8],
    ["0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "cbBTC", 8],
    ["0xB8c77482e45F1F44dE1745F52C74426C631bDD52", "BNB", 18],
    ["0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", "MATIC", 18],
    ["0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6", "POL", 18],
    ["0x514910771AF9Ca656af840dff83E8264EcF986CA", "LINK", 18],
    ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", "UNI", 18],
    ["0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", "SHIB", 18],
    ["0x6982508145454Ce325dDbE47a25d4ec3d2311933", "PEPE", 18],
  ],
  // BNB Smart Chain — the single most common place funds land by mistake
  56: [
    ["0x55d398326f99059fF775485246999027B3197955", "USDT", 18],
    ["0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", 18],
    ["0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", "BUSD", 18],
    ["0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", "DAI", 18],
    ["0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409", "FDUSD", 18],
    ["0x2170Ed0880ac9A755fd29B2688956BD959F933F8", "ETH", 18],
    ["0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", "BTCB", 18],
    ["0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "WBNB", 18],
    ["0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", "CAKE", 18],
    ["0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", "XRP", 18],
    ["0xbA2aE424d960c26247Dd6c32edC70B295c744C43", "DOGE", 8],
  ],
  // Polygon
  137: [
    ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "USDT", 6],
    ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "USDC", 6],
    ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", "USDC.e", 6],
    ["0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", "DAI", 18],
    ["0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", "WETH", 18],
    ["0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", "WBTC", 8],
    ["0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", "WPOL", 18],
  ],
  // Arbitrum One
  42161: [
    ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "USDT", 6],
    ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "USDC", 6],
    ["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", "USDC.e", 6],
    ["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18],
    ["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "WETH", 18],
    ["0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", "WBTC", 8],
    ["0x912CE59144191C1204E64559FE8253a0e49E6548", "ARB", 18],
  ],
  // Optimism
  10: [
    ["0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "USDT", 6],
    ["0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "USDC", 6],
    ["0x7F5c764cBc14f9669B88837ca1490cCa17c31607", "USDC.e", 6],
    ["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", "DAI", 18],
    ["0x4200000000000000000000000000000000000006", "WETH", 18],
    ["0x4200000000000000000000000000000000000042", "OP", 18],
  ],
  // Base
  8453: [
    ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "USDC", 6],
    ["0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", "USDbC", 6],
    ["0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", "USDT", 6],
    ["0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", "DAI", 18],
    ["0x4200000000000000000000000000000000000006", "WETH", 18],
    ["0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", "cbBTC", 8],
  ],
  // opBNB: native BNB only for now. Add tokens here once their addresses are
  // verified on-chain (or cover them with TOKENS_204 / ALCHEMY_API_KEY).
  204: [],
  // Avalanche C-Chain
  43114: [
    ["0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", "USDT", 6],
    ["0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", "USDC", 6],
    ["0xc7198437980c041c805A1EDcbA50c1Ce5db95118", "USDT.e", 6],
    ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", "USDC.e", 6],
    ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", "DAI.e", 18],
    ["0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", "WAVAX", 18],
    ["0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", "WETH.e", 18],
    ["0x152b9d0FdC40C096757F570A51E494bd4b943E50", "BTC.b", 8],
  ],
};

// The literal checksummed strings, for the test that guards against typos.
export const CURATED_TOKENS_RAW = RAW;

export const CURATED_TOKENS: Record<number, TokenInfo[]> = Object.fromEntries(
  Object.entries(RAW).map(([chainId, list]) => [
    Number(chainId),
    list.map(([address, symbol, decimals]) => ({
      // Normalise via lowercase so a bad checksum can't throw at runtime; the
      // test suite is what catches it.
      address: getAddress(address.toLowerCase()),
      symbol,
      decimals,
    })),
  ]),
);
