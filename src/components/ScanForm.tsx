"use client";

import { useState } from "react";
import { isAddress } from "viem";
import type { ChainResult } from "@/lib/scan";

export function ScanForm({
  onResult,
}: {
  onResult: (address: string, results: ChainResult[]) => void;
}) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setError(null);
    if (!isAddress(address.trim())) {
      setError("Enter a valid EVM address (0x…).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      onResult(data.address, data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <label htmlFor="addr">Wallet address to check</label>
      <div className="row">
        <div>
          <input
            id="addr"
            type="text"
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
          />
        </div>
        <button onClick={scan} disabled={loading}>
          {loading ? "Scanning…" : "Scan"}
        </button>
      </div>
      <p className="note">
        Read-only. This proves nothing and moves nothing — it just shows what
        this address holds on each network. We never ask for your seed phrase.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
