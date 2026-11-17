"use client";

import { useState } from "react";
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
  const [showSpam, setShowSpam] = useState(false);

  // A chain that only holds likely-spam tokens isn't worth a card unless the
  // user asked to see them.
  const visible = results
    .map((chain) => ({
      chain,
      assets: chain.assets.filter((a) => showSpam || !a.spam),
    }))
    .filter((c) => c.assets.length > 0);
  const spamCount = results.reduce(
    (n, c) => n + c.assets.filter((a) => a.spam).length,
    0,
  );

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
      <h3 style={{ marginTop: 0 }}>
        {visible.length > 0
          ? `Found on ${visible.length} network(s)`
          : "Only likely-spam tokens found"}
      </h3>
      {visible.map(({ chain, assets }) => (
        <div className="chain-card" key={chain.chainId}>
          <div className="chain-head">
            <span className="chain-name">{chain.chainName}</span>
            <span className={`pill ${chain.hasGas ? "gas-ok" : "no-gas"}`}>
              {chain.hasGas
                ? `gas: ${chain.nativeSymbol} available`
                : `no ${chain.nativeSymbol} for gas`}
            </span>
          </div>
          {assets.map((asset, i) => (
            <div
              className={`asset${asset.spam ? " spam" : ""}`}
              key={`${asset.kind}-${asset.address ?? "native"}-${i}`}
            >
              <span>
                <span className="amt">{asset.formatted}</span> {asset.symbol}
                {asset.kind === "token" && (
                  <span className="pill" style={{ marginLeft: 8 }}>
                    token
                  </span>
                )}
              </span>
              {asset.spam ? (
                // Never offer to move these: interacting with an advert
                // token's contract is a common phishing trap.
                <span className="pill no-gas" title={asset.spamReason}>
                  likely spam — ignore
                </span>
              ) : (
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
              )}
            </div>
          ))}
        </div>
      ))}
      {spamCount > 0 && (
        <>
          <button className="spam-toggle" onClick={() => setShowSpam((v) => !v)}>
            {showSpam
              ? "Hide likely-spam tokens"
              : `Show ${spamCount} hidden likely-spam token(s)`}
          </button>
          {showSpam && (
            <p className="note">
              These look like unsolicited advert tokens. Don&apos;t visit links
              in their names or try to sell or &ldquo;claim&rdquo; them — that
              is how these scams drain wallets.
            </p>
          )}
        </>
      )}
    </div>
  );
}
