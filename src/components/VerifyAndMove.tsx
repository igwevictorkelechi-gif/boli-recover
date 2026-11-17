"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useSignMessage,
  useSwitchChain,
  useChainId,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import {
  isAddress,
  getAddress,
  parseUnits,
  erc20Abi,
  type Address,
} from "viem";
import type { Selection } from "./ResultsTable";
import { config } from "@/wagmi";

type SupportedChainId = (typeof config)["chains"][number]["id"];

export function VerifyAndMove({
  ownerAddress,
  selection,
}: {
  ownerAddress: string;
  selection: Selection;
}) {
  const { address: connected, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const activeChainId = useChainId();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState(selection.asset.formatted);

  const sameWallet =
    isConnected &&
    connected &&
    getAddress(connected) === getAddress(ownerAddress as Address);

  async function proveOwnership() {
    setError(null);
    setBusy(true);
    try {
      const chRes = await fetch("/api/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: ownerAddress }),
      });
      const chData = await chRes.json();
      if (!chRes.ok) throw new Error(chData.error ?? "Could not start verification");

      const signature = await signMessageAsync({ message: chData.message });

      const vRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: ownerAddress, signature }),
      });
      const vData = await vRes.json();
      if (!vRes.ok || !vData.verified) {
        throw new Error(vData.error ?? "Verification failed");
      }
      setVerified(true);
      setStatus("Ownership verified. You can now move the funds.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function move() {
    setError(null);
    setTxHash(null);
    setStatus(null);

    if (!isAddress(destination.trim())) {
      setError("Enter a valid destination address.");
      return;
    }
    let value: bigint;
    try {
      value = parseUnits(amount.trim(), selection.asset.decimals);
    } catch {
      setError("Invalid amount.");
      return;
    }
    if (value <= 0n) {
      setError("Amount must be greater than zero.");
      return;
    }

    setBusy(true);
    try {
      // Make sure the wallet is on the chain the funds are stuck on.
      if (activeChainId !== selection.chainId) {
        setStatus(`Switching wallet to ${selection.chainName}…`);
        await switchChainAsync({
          chainId: selection.chainId as SupportedChainId,
        });
      }

      const to = getAddress(destination.trim());
      setStatus("Confirm the transaction in your wallet…");

      let hash: string;
      if (selection.asset.kind === "native") {
        hash = await sendTransactionAsync({ to, value });
      } else {
        hash = await writeContractAsync({
          address: selection.asset.address as Address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, value],
        });
      }
      setTxHash(hash);
      setStatus("Transaction submitted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const a = selection.asset;

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        Move {a.formatted} {a.symbol} on {selection.chainName}
      </h3>
      <p className="note">
        Owner address: <span className="mono">{ownerAddress}</span>
      </p>

      {/* Step 1: connect the owning wallet */}
      {!isConnected && (
        <>
          <button
            onClick={() => connect({ connector: connectors[0] })}
            disabled={connecting || !connectors[0]}
          >
            {connecting ? "Connecting…" : "Connect wallet"}
          </button>
          <p className="note">
            Connect the wallet that controls the owner address above.
          </p>
        </>
      )}

      {isConnected && !sameWallet && (
        <p className="error">
          Connected wallet ({connected}) is not the owner address. Switch to the
          wallet that controls {ownerAddress}.
        </p>
      )}

      {/* Step 2: prove ownership */}
      {sameWallet && !verified && (
        <>
          <button onClick={proveOwnership} disabled={busy}>
            {busy ? "Waiting for signature…" : "Prove ownership (free, no gas)"}
          </button>
          <p className="note">
            You&apos;ll sign a message. It moves nothing and costs nothing — it
            just proves you hold the key.
          </p>
        </>
      )}

      {/* Step 3: move */}
      {sameWallet && verified && (
        <>
          {!selection.hasGas && (
            <p className="error">
              This address shows no {selection.nativeSymbol} on{" "}
              {selection.chainName}. Moving {a.kind === "token" ? "a token" : "funds"} needs{" "}
              {selection.nativeSymbol} for gas on this chain. Send a small amount
              of {selection.nativeSymbol} to this address first, then come back.
            </p>
          )}
          <div className="spacer" />
          <label htmlFor="dest">Destination address</label>
          <input
            id="dest"
            type="text"
            placeholder="0x… where the funds should go"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <div className="spacer" />
          <label htmlFor="amt">Amount ({a.symbol})</label>
          <input
            id="amt"
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {a.kind === "native" && (
            <p className="note">
              Leave a little {a.symbol} behind to cover gas, or the send will
              fail.
            </p>
          )}
          <div className="spacer" />
          <button onClick={move} disabled={busy}>
            {busy ? "Working…" : `Move ${a.symbol}`}
          </button>
        </>
      )}

      {status && <p className="ok">{status}</p>}
      {txHash && (
        <p className="note">
          Tx hash: <span className="mono">{txHash}</span>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
