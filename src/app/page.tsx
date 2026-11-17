"use client";

import { useEffect, useRef, useState } from "react";
import { ScanForm, runScan, type ScanResponse } from "@/components/ScanForm";
import {
  ResultsTable,
  selectionKey,
  type Selection,
} from "@/components/ResultsTable";
import { VerifyAndMove } from "@/components/VerifyAndMove";
import { WalletButton } from "@/components/Wallet";
import { Faq, HowItWorks } from "@/components/Info";

export default function Home() {
  const [scanned, setScanned] = useState<ScanResponse | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const moveRef = useRef<HTMLDivElement>(null);

  // Bring the move panel into view when an asset is picked (matters on phones).
  useEffect(() => {
    if (selection)
      moveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selection]);

  async function rescan() {
    if (!scanned) return;
    setRescanning(true);
    setRescanError(null);
    try {
      setScanned(await runScan(scanned.address));
      setSelection(null);
    } catch (e) {
      setRescanError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setRescanning(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Boli Recover</span>
          <WalletButton />
        </div>
      </header>

      <main className="container">
        <h1>Sent crypto on the wrong network?</h1>
        <p className="sub">
          On Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base and
          Avalanche, your address is the same on every network — and so is your
          key. Funds sent to your address on the &ldquo;wrong&rdquo; network
          aren&apos;t lost; your wallet just isn&apos;t showing that network.
          Find them here and move them out yourself.
        </p>

        <ScanForm
          onStart={() => setSelection(null)}
          onResult={(r) => {
            setScanned(r);
            setSelection(null);
          }}
        />

        {rescanning && (
          <p className="note" role="status">
            Scanning again… this can take up to 20 seconds.
          </p>
        )}
        {scanned && (
          <ResultsTable
            results={scanned.results}
            onSelect={setSelection}
            onRetry={rescan}
            retrying={rescanning}
            selectedKey={
              selection
                ? selectionKey(selection.chainId, selection.asset)
                : undefined
            }
          />
        )}
        {rescanError && <p className="error">{rescanError}</p>}

        <div ref={moveRef}>
          {scanned && selection && (
            <VerifyAndMove
              // Fresh state per asset, so a plan for one asset never carries over.
              key={`${scanned.address}-${selectionKey(selection.chainId, selection.asset)}`}
              ownerAddress={scanned.address}
              selection={selection}
              onMoved={rescan}
            />
          )}
        </div>

        <HowItWorks />
        <Faq />

        <footer className="footer">
          <p>
            Boli Recover never asks for your seed phrase or private key, and
            never holds your funds. Every transaction is signed in your own
            wallet. Anyone who asks for your recovery phrase — including
            &ldquo;support&rdquo; — is trying to steal from you.
          </p>
        </footer>
      </main>
    </>
  );
}
