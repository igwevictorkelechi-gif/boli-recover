"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useSignMessage,
  useSwitchChain,
  useChainId,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import type { Selection } from "./ResultsTable";
import type { TransferPlan } from "@/lib/transfer";
import { config } from "@/wagmi";

type SupportedChainId = (typeof config)["chains"][number]["id"];

type Session = { token: string; expiresAt: string };

function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = config.chains.find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

// "Send at least 0.000069929725864464 ETH" is hard to act on. Round the
// shortfall UP to two significant figures (0.00007) so following the
// instruction always covers it.
function roundUpForHumans(raw: string, decimals: number): string {
  const v = BigInt(raw);
  if (v <= 0n) return "0";
  const digits = v.toString().length;
  if (digits <= 2) return formatUnits(v, decimals);
  const unit = 10n ** BigInt(digits - 2);
  const rounded = ((v + unit - 1n) / unit) * unit;
  return formatUnits(rounded, decimals);
}

// Defence in depth: the server builds the transaction, but before the wallet
// is asked to sign it we check it does exactly what the user typed — right
// network, right asset, right destination, right amount. A tampered or buggy
// response is refused instead of signed.
function planMismatch(
  plan: TransferPlan,
  o: {
    owner: Address;
    selection: Selection;
    destination: Address;
    requested: bigint | "max";
  },
): string | null {
  if (plan.chainId !== o.selection.chainId) return "network";
  if (getAddress(plan.from) !== o.owner) return "sender";
  const value = BigInt(plan.tx.value);
  const { asset } = o.selection;

  if (asset.kind === "native") {
    if (plan.tx.data && plan.tx.data !== "0x") return "call data";
    if (getAddress(plan.tx.to) !== o.destination) return "destination";
    if (o.requested !== "max" && value !== o.requested) return "amount";
    return null;
  }

  if (value !== 0n) return "value";
  if (!asset.address || getAddress(plan.tx.to) !== getAddress(asset.address)) {
    return "token contract";
  }
  try {
    const call = decodeFunctionData({
      abi: erc20Abi,
      data: plan.tx.data as Hex,
    });
    if (call.functionName !== "transfer") return "function";
    const [to, amount] = call.args as readonly [Address, bigint];
    if (getAddress(to) !== o.destination) return "destination";
    if (amount.toString() !== plan.amount.raw) return "amount";
    if (o.requested !== "max" && amount !== o.requested) return "amount";
  } catch {
    return "call data";
  }
  return null;
}

// Shown when the address can't pay the network fee: exactly how much native
// coin to send, to which address, on which network. This is the "fund gas"
// path — the user tops up from an exchange or another wallet they control.
function GasHelp({
  plan,
  shortfall,
  owner,
}: {
  plan: TransferPlan;
  shortfall: NonNullable<TransferPlan["shortfall"]>;
  owner: Address;
}) {
  const [copied, setCopied] = useState(false);
  const decimals =
    config.chains.find((c) => c.id === plan.chainId)?.nativeCurrency.decimals ??
    18;
  const need = roundUpForHumans(shortfall.raw, decimals);

  async function copyOwner() {
    try {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the address is shown in full anyway */
    }
  }

  return (
    <div className="gas-help">
      <p>
        <strong>
          Needs about {need} more {shortfall.symbol} for the network fee.
        </strong>{" "}
        Moving anything on {plan.chainName} is paid for in {shortfall.symbol},
        and this address doesn&apos;t have enough.
      </p>
      <ol>
        <li>
          Send at least {need} {shortfall.symbol} (a little extra is wise — fees
          move) to this address:
          <div className="row" style={{ marginTop: 6 }}>
            <div>
              <span className="mono">{owner}</span>
            </div>
            <button className="secondary" onClick={copyOwner}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </li>
        <li>
          Send it <strong>on {plan.chainName}</strong>. From an exchange, pick
          the {plan.chainName} network when withdrawing; from another wallet,
          switch it to {plan.chainName} first.
        </li>
        <li>Once it arrives, press Re-check above.</li>
      </ol>
    </div>
  );
}

export function VerifyAndMove({
  ownerAddress,
  selection,
}: {
  ownerAddress: string;
  selection: Selection;
}) {
  const owner = getAddress(ownerAddress as Address);
  const { address: connected, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const activeChainId = useChainId();
  const { sendTransactionAsync } = useSendTransaction();

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [useMax, setUseMax] = useState(true);
  const [plan, setPlan] = useState<TransferPlan | null>(null);

  const receipt = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: selection.chainId as SupportedChainId,
  });

  const a = selection.asset;
  const sameWallet =
    isConnected && connected && getAddress(connected) === owner;
  const verified =
    session !== null && new Date(session.expiresAt).getTime() > Date.now();

  function resetPlan() {
    setPlan(null);
    setStatus(null);
  }

  async function proveOwnership() {
    setError(null);
    setBusy(true);
    try {
      const chRes = await fetch("/api/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: owner }),
      });
      const chData = await chRes.json();
      if (!chRes.ok)
        throw new Error(chData.error ?? "Could not start verification");

      const signature = await signMessageAsync({ message: chData.message });

      const vRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: owner, signature }),
      });
      const vData = await vRes.json();
      if (!vRes.ok || !vData.verified) {
        throw new Error(vData.error ?? "Verification failed");
      }
      setSession({ token: vData.token, expiresAt: vData.expiresAt });
      setStatus("Ownership verified. Enter where the funds should go.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  // Parse what the user asked for. Returns null (and sets an error) if invalid.
  function readInputs(): { to: Address; requested: bigint | "max" } | null {
    const dest = destination.trim();
    if (!isAddress(dest)) {
      setError("Enter a valid destination address.");
      return null;
    }
    if (useMax) return { to: getAddress(dest), requested: "max" };
    let value: bigint;
    try {
      value = parseUnits(amount.trim(), a.decimals);
    } catch {
      setError("Invalid amount.");
      return null;
    }
    if (value <= 0n) {
      setError("Amount must be greater than zero.");
      return null;
    }
    return { to: getAddress(dest), requested: value };
  }

  async function review() {
    setError(null);
    setStatus(null);
    setPlan(null);
    const input = readInputs();
    if (!input || !session) return;

    setBusy(true);
    try {
      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          owner,
          chainId: selection.chainId,
          asset:
            a.kind === "native"
              ? { kind: "native" }
              : { kind: "token", address: a.address },
          to: input.to,
          amount:
            input.requested === "max" ? "max" : input.requested.toString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.reverify) setSession(null);
        throw new Error(data.error ?? "Could not prepare the transfer");
      }
      const p = data as TransferPlan;
      const bad = planMismatch(p, {
        owner,
        selection,
        destination: input.to,
        ...input,
      });
      if (bad) {
        throw new Error(
          `The prepared transaction doesn't match what you entered (${bad}). Nothing was sent.`,
        );
      }
      setPlan(p);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not prepare the transfer",
      );
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!plan || plan.shortfall) return;
    setError(null);
    setTxHash(null);
    setBusy(true);
    try {
      if (activeChainId !== plan.chainId) {
        setStatus(`Switching wallet to ${plan.chainName}…`);
        await switchChainAsync({ chainId: plan.chainId as SupportedChainId });
      }
      setStatus("Confirm the transaction in your wallet…");

      const common = {
        chainId: plan.chainId as SupportedChainId,
        to: plan.tx.to,
        data: plan.tx.data,
        value: BigInt(plan.tx.value),
        gas: BigInt(plan.tx.gas),
      };
      // Pass the same fee caps the server reserved for, so a "max" native send
      // can't be pushed over the balance by the wallet picking higher fees.
      const hash = plan.tx.maxFeePerGas
        ? await sendTransactionAsync({
            ...common,
            maxFeePerGas: BigInt(plan.tx.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(plan.tx.maxPriorityFeePerGas ?? "0"),
          })
        : await sendTransactionAsync({
            ...common,
            gasPrice: plan.tx.gasPrice ? BigInt(plan.tx.gasPrice) : undefined,
          });
      setTxHash(hash);
      setStatus("Transaction submitted. Waiting for it to confirm…");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const explorer = txHash ? explorerTxUrl(selection.chainId, txHash) : null;

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>
        Move {a.formatted} {a.symbol} on {selection.chainName}
      </h3>
      <p className="note">
        Owner address: <span className="mono">{owner}</span>
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
          wallet that controls {owner}.
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

      {/* Step 3: say where it goes, then review */}
      {sameWallet && verified && !txHash && (
        <>
          <label htmlFor="dest">Destination address</label>
          <input
            id="dest"
            type="text"
            placeholder="0x… where the funds should go"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              resetPlan();
            }}
          />
          <p className="note">
            Make sure this address accepts {a.symbol} on{" "}
            <strong>{selection.chainName}</strong>. If it&apos;s an exchange
            deposit address, check the exchange supports the{" "}
            {selection.chainName} network for {a.symbol} — otherwise this
            happens again.
          </p>

          <label htmlFor="amt">Amount ({a.symbol})</label>
          <div className="row">
            <div>
              <input
                id="amt"
                type="text"
                placeholder={useMax ? "" : "0.0"}
                value={useMax ? `Max (${a.formatted})` : amount}
                readOnly={useMax}
                onFocus={() => {
                  if (useMax) {
                    setUseMax(false);
                    setAmount(a.formatted);
                    resetPlan();
                  }
                }}
                onChange={(e) => {
                  setAmount(e.target.value);
                  resetPlan();
                }}
              />
            </div>
            <button
              className="secondary"
              onClick={() => {
                setUseMax(true);
                resetPlan();
              }}
              disabled={useMax}
            >
              Max
            </button>
          </div>
          {a.kind === "native" && useMax && (
            <p className="note">Max sends everything except the network fee.</p>
          )}
          <div className="spacer" />
          <button onClick={review} disabled={busy || !destination.trim()}>
            {busy && !plan
              ? "Checking…"
              : plan
                ? "Re-check"
                : "Review transfer"}
          </button>
        </>
      )}

      {/* Step 4: the plan — either a gas shortfall or ready to sign */}
      {sameWallet && verified && plan && !txHash && (
        <div className="plan">
          <div className="plan-row">
            <span>Send</span>
            <span className="mono">
              {plan.amount.formatted} {plan.amount.symbol}
            </span>
          </div>
          <div className="plan-row">
            <span>To</span>
            <span className="mono">
              {isAddress(destination.trim())
                ? getAddress(destination.trim())
                : destination.trim()}
            </span>
          </div>
          <div className="plan-row">
            <span>Network</span>
            <span>{plan.chainName}</span>
          </div>
          <div className="plan-row">
            <span>Network fee (up to)</span>
            <span className="mono">
              {plan.fee.formatted} {plan.fee.symbol}
              {!plan.fee.estimated && " (approx.)"}
            </span>
          </div>
          <div className="plan-row">
            <span>Gas balance</span>
            <span className="mono">
              {plan.nativeBalance.formatted} {plan.nativeBalance.symbol}
            </span>
          </div>

          {plan.warnings.map((w) => (
            <p className="warn" key={w}>
              {w}
            </p>
          ))}

          {plan.shortfall ? (
            <GasHelp plan={plan} shortfall={plan.shortfall} owner={owner} />
          ) : (
            <>
              <div className="spacer" />
              <button onClick={send} disabled={busy}>
                {busy ? "Working…" : `Send in wallet`}
              </button>
              <p className="note">
                Your wallet will show this exact transaction. Check the
                destination there before confirming.
              </p>
            </>
          )}
        </div>
      )}

      {txHash && (
        <div className="plan">
          <p className={receipt.data?.status === "reverted" ? "error" : "ok"}>
            {receipt.data?.status === "success"
              ? "Confirmed. The funds have moved."
              : receipt.data?.status === "reverted"
                ? "The transaction was mined but failed. No funds moved; only the fee was spent."
                : "Submitted. Waiting for confirmation…"}
          </p>
          <p className="note">
            Tx: <span className="mono">{txHash}</span>
            {explorer && (
              <>
                {" "}
                <a href={explorer} target="_blank" rel="noreferrer">
                  View on explorer
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {status && !txHash && <p className="ok">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
