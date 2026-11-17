"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import type { ChainResult } from "@/lib/scan";

export type ScanResponse = { address: string; results: ChainResult[] };

export async function runScan(address: string): Promise<ScanResponse> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Scan failed. Try again.");
  return data as ScanResponse;
}

export function addressError(input: string): string | null {
  const v = input.trim();
  if (!v) return "Paste a wallet address first.";
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
    return "That isn't an EVM address. It should start with 0x and be 42 characters long.";
  }
  if (!isAddress(v)) {
    return "The capital letters in this address don't match its checksum — it may have a typo. Copy it again from your wallet.";
  }
  return null;
}

export function ScanForm({
  onResult,
  onStart,
}: {
  onResult: (r: ScanResponse) => void;
  onStart?: () => void;
}) {
  const { address: connected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  async function scan(target = address) {
    setError(null);
    const bad = addressError(target);
    if (bad) {
      setError(bad);
      return;
    }
    setLoading(true);
    onStart?.();
    try {
      onResult(await runScan(target.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed. Try again.");
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
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
          />
        </div>
        <button onClick={() => scan()} disabled={loading}>
          {loading ? "Scanning…" : "Scan"}
        </button>
      </div>
      {mounted &&
        connected &&
        address.trim().toLowerCase() !== connected.toLowerCase() && (
          <button
            className="link"
            style={{ marginTop: 8 }}
            onClick={() => {
              setAddress(connected);
              scan(connected);
            }}
            disabled={loading}
          >
            Scan my connected wallet instead
          </button>
        )}
      {loading && (
        <p className="note">
          Checking 7 networks… this can take up to 20 seconds.
        </p>
      )}
      <p className="note">
        Read-only. This proves nothing and moves nothing — it just shows what
        this address holds on each network. We never ask for your seed phrase.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
