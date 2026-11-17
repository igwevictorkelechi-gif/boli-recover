"use client";

import type { AssetBalance, ChainResult } from "@/lib/scan";

export type Selection = {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  hasGas: boolean;
  asset: AssetBalance;
};

export function ResultsTable({
  results,
  onSelect,
}: {
  results: ChainResult[];
  onSelect: (sel: Selection) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="panel">
        <p className="note">
          No balances found on the supported networks. If you expected funds
          here, they may be on a chain or token not yet covered by the scan —
          wiring in an indexer (see the README) widens coverage to any ERC-20.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Found on {results.length} network(s)</h3>
      {results.map((chain) => (
        <div className="chain-card" key={chain.chainId}>
          <div className="chain-head">
            <span className="chain-name">{chain.chainName}</span>
            <span className={`pill ${chain.hasGas ? "gas-ok" : "no-gas"}`}>
              {chain.hasGas
                ? `gas: ${chain.nativeSymbol} available`
                : `no ${chain.nativeSymbol} for gas`}
            </span>
          </div>
          {chain.assets.map((asset, i) => (
            <div className="asset" key={`${asset.kind}-${asset.address ?? "native"}-${i}`}>
              <span>
                <span className="amt">{asset.formatted}</span> {asset.symbol}
                {asset.kind === "token" && (
                  <span className="pill" style={{ marginLeft: 8 }}>
                    token
                  </span>
                )}
              </span>
              <button
                className="secondary"
                onClick={() =>
                  onSelect({
                    chainId: chain.chainId,
                    chainName: chain.chainName,
                    nativeSymbol: chain.nativeSymbol,
                    hasGas: chain.hasGas,
                    asset,
                  })
                }
              >
                Move this
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
