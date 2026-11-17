"use client";

import { useState } from "react";
import type { AssetBalance, ChainResult } from "@/lib/scan";
import { displayAmount } from "@/lib/planCheck";

export type Selection = {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  hasGas: boolean;
  asset: AssetBalance;
};

export function selectionKey(chainId: number, asset: AssetBalance): string {
  return `${chainId}-${asset.address ?? "native"}`;
}

export function ResultsTable({
  results,
  onSelect,
  onRetry,
  retrying,
  selectedKey,
}: {
  results: ChainResult[];
  onSelect: (sel: Selection) => void;
  onRetry: () => void;
  retrying: boolean;
  selectedKey?: string;
}) {
  const [showSpam, setShowSpam] = useState(false);

  // Hide likely-spam tokens unless asked; a chain holding only spam then has
  // nothing to show and drops out of the "found" list.
  const withFunds = results
    .map((chain) => ({
      chain,
      assets: chain.assets.filter((a) => showSpam || !a.spam),
    }))
    .filter((c) => c.assets.length > 0);
  const failed = results.filter((c) => c.error);
  const hasFunds = (id: number) =>
    withFunds.some((w) => w.chain.chainId === id);
  // Chains that errored and showed nothing: these are the "unknown" ones.
  const unchecked = failed.filter((c) => !hasFunds(c.chainId));
  const empty = results.filter((c) => !c.error && !hasFunds(c.chainId));
  const spamCount = results.reduce(
    (n, c) => n + c.assets.filter((a) => a.spam).length,
    0,
  );
  const usedCurated = results.some((c) => c.tokenSource === "curated");

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        {withFunds.length > 0
          ? `Found funds on ${withFunds.length} network${withFunds.length > 1 ? "s" : ""}`
          : failed.length > 0
            ? "Nothing found yet"
            : "No funds found"}
      </h3>

      {withFunds.map(({ chain, assets }) => (
        <div className="chain-card" key={chain.chainId}>
          <div className="chain-head">
            <span className="chain-name">{chain.chainName}</span>
            <span className={`pill ${chain.hasGas ? "gas-ok" : "no-gas"}`}>
              {chain.hasGas
                ? `has ${chain.nativeSymbol} for gas`
                : `no ${chain.nativeSymbol} for gas`}
            </span>
          </div>
          {assets.map((asset) => {
            const key = selectionKey(chain.chainId, asset);
            return (
              <div
                className={`asset${asset.spam ? " spam" : ""}${key === selectedKey ? " selected" : ""}`}
                key={key}
              >
                <span className="asset-label">
                  <span className="amt" title={asset.formatted}>
                    {displayAmount(asset.formatted)}
                  </span>{" "}
                  <span className="sym">{asset.symbol}</span>
                  {asset.kind === "native" && (
                    <span className="pill" style={{ marginLeft: 8 }}>
                      gas coin
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
                    {key === selectedKey ? "Selected" : "Move this"}
                  </button>
                )}
              </div>
            );
          })}
          {chain.error && <p className="warn">{chain.error}</p>}
        </div>
      ))}

      {unchecked.length > 0 && (
        <div className="chain-card failed">
          <p style={{ margin: 0 }}>
            <strong>Couldn&apos;t check:</strong>{" "}
            {unchecked.map((c) => c.chainName).join(", ")}. The network
            didn&apos;t respond — this doesn&apos;t mean nothing is there.
          </p>
          <button
            className="secondary"
            style={{ marginTop: 10 }}
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Scanning again…" : "Scan again"}
          </button>
        </div>
      )}

      {empty.length > 0 && (
        <p className="note">
          Checked, nothing found: {empty.map((c) => c.chainName).join(", ")}.
        </p>
      )}

      {withFunds.length === 0 && failed.length === 0 && (
        <p className="note">
          If you expected funds here, double-check the address you sent{" "}
          <em>to</em> — it may not be this one. If you sent to an exchange
          deposit address on the wrong network, only the exchange can recover it
          (see the FAQ below).
          {usedCurated &&
            " This scan checks native coins and the most common tokens; less common tokens need the full-coverage indexer."}
        </p>
      )}

      {spamCount > 0 && (
        <>
          <button className="link" onClick={() => setShowSpam((v) => !v)}>
            {showSpam
              ? "Hide likely-spam tokens"
              : `Show ${spamCount} hidden likely-spam token${spamCount > 1 ? "s" : ""}`}
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
