"use client";

import { useState } from "react";
import { ScanForm } from "@/components/ScanForm";
import { ResultsTable, type Selection } from "@/components/ResultsTable";
import { VerifyAndMove } from "@/components/VerifyAndMove";
import type { ChainResult } from "@/lib/scan";

export default function Home() {
  const [scanned, setScanned] = useState<{
    address: string;
    results: ChainResult[];
  } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  return (
    <main className="container">
      <h1>Boli Recover</h1>
      <p className="sub">
        Find funds stuck on the wrong EVM network and move them out. The same
        key controls your address on every chain — these funds aren&apos;t lost,
        just hidden. Scan is read-only; moving requires signed proof you own the
        wallet.
      </p>

      <ScanForm
        onResult={(address, results) => {
          setScanned({ address, results });
          setSelection(null);
        }}
      />

      {scanned && (
        <ResultsTable
          results={scanned.results}
          onSelect={(sel) => setSelection(sel)}
        />
      )}

      {scanned && selection && (
        <VerifyAndMove ownerAddress={scanned.address} selection={selection} />
      )}
    </main>
  );
}
