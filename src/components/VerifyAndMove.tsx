"use client";

import { useState } from "react";
import {
  useAccount,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useChainId,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  getAddress,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import type { Selection } from "./ResultsTable";
import type { TransferPlan } from "@/lib/transfer";
import {
  displayAmount,
  planMismatch,
  roundUpForHumans,
  shortAddress,
} from "@/lib/planCheck";
import { addressError } from "./ScanForm";
import { ConnectChoices } from "./Wallet";
import { config } from "@/wagmi";

type SupportedChainId = (typeof config)["chains"][number]["id"];
type Session = { token: string; expiresAt: string };

function chainMeta(chainId: number) {
  return config.chains.find((c) => c.id === chainId);
}

function explorerTxUrl(chainId: number, hash: string): string | null {
  const base = chainMeta(chainId)?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

// Wallet and RPC errors are long and technical; say what happened plainly.
function friendlyError(e: unknown, fallback: string): string {
  const msg =
    (e as { shortMessage?: string })?.shortMessage ??
    (e instanceof Error ? e.message : "");
  if (/user (rejected|denied)|rejected the request|denied/i.test(msg)) {
    return "You declined in your wallet. Nothing was sent.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough of this network's coin to pay the fee. Press Re-check for the exact amount needed.";
  }
  if (
    /chain|network/i.test(msg) &&
    /switch|unrecognized|unsupported/i.test(msg)
  ) {
    return "Your wallet couldn't switch networks. Switch it manually, then try again.";
  }
  return msg ? msg.split("\n")[0] : fallback;
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
  const decimals = chainMeta(plan.chainId)?.nativeCurrency.decimals ?? 18;
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
        <li>Once it arrives (usually under a minute), press Re-check.</li>
      </ol>
    </div>
  );
}

export function VerifyAndMove({
  ownerAddress,
  selection,
  onMoved,
}: {
  ownerAddress: string;
  selection: Selection;
  onMoved: () => void;
}) {
  const owner = getAddress(ownerAddress as Address);
  const { address: connected, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const activeChainId = useChainId();
  const { sendTransactionAsync } = useSendTransaction();

  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<null | "verify" | "review" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [useMax, setUseMax] = useState(true);
  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const [confirmedNetwork, setConfirmedNetwork] = useState(false);

  const receipt = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    chainId: selection.chainId as SupportedChainId,
  });

  const a = selection.asset;
  const sameWallet =
    isConnected && !!connected && getAddress(connected) === owner;
  const verified =
    session !== null && new Date(session.expiresAt).getTime() > Date.now();

  function resetPlan() {
    setPlan(null);
    setStatus(null);
    setConfirmedNetwork(false);
  }

  async function proveOwnership() {
    setError(null);
    setStatus(null);
    setBusy("verify");
    try {
      const chRes = await fetch("/api/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: owner }),
      });
      const ch = await chRes.json().catch(() => ({}));
      if (!chRes.ok)
        throw new Error(ch.error ?? "Could not start verification");

      const signature = await signMessageAsync({ message: ch.message });

      const vRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: owner,
          signature,
          challenge: ch.challenge,
        }),
      });
      const v = await vRes.json().catch(() => ({}));
      if (!vRes.ok || !v.verified) {
        throw new Error(v.error ?? "Verification failed");
      }
      setSession({ token: v.token, expiresAt: v.expiresAt });
      setStatus("Ownership verified. Now choose where the funds should go.");
    } catch (e) {
      setError(friendlyError(e, "Verification failed"));
    } finally {
      setBusy(null);
    }
  }

  // Parse what the user asked for. Returns null (and sets an error) if invalid.
  function readInputs(): { to: Address; requested: bigint | "max" } | null {
    const dest = destination.trim();
    const bad = dest ? addressError(dest) : "Enter a destination address.";
    if (bad) {
      setError(bad);
      return null;
    }
    if (useMax) return { to: getAddress(dest), requested: "max" };
    let value: bigint;
    try {
      value = parseUnits(amount.trim().replace(/,/g, ""), a.decimals);
    } catch {
      setError("Enter the amount as a number, e.g. 12.5");
      return null;
    }
    if (value <= 0n) {
      setError("Amount must be greater than zero.");
      return null;
    }
    if (value > BigInt(a.raw)) {
      setError(
        `That's more than the ${displayAmount(a.formatted)} ${a.symbol} available.`,
      );
      return null;
    }
    return { to: getAddress(dest), requested: value };
  }

  async function review() {
    setError(null);
    setStatus(null);
    setPlan(null);
    setConfirmedNetwork(false);
    const input = readInputs();
    if (!input) return;
    if (!verified || !session) {
      setSession(null);
      setError("Your ownership check expired. Prove ownership again.");
      return;
    }

    setBusy("review");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.reverify) setSession(null);
        throw new Error(data.error ?? "Could not prepare the transfer");
      }
      const p = data as TransferPlan;
      const bad = planMismatch(p, {
        owner,
        chainId: selection.chainId,
        asset:
          a.kind === "native"
            ? { kind: "native" }
            : { kind: "token", address: a.address as Address },
        destination: input.to,
        requested: input.requested,
      });
      if (bad) {
        throw new Error(
          `The prepared transaction doesn't match what you entered (${bad}). Nothing was sent.`,
        );
      }
      setPlan(p);
    } catch (e) {
      setError(friendlyError(e, "Could not prepare the transfer"));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!plan || plan.shortfall || !confirmedNetwork) return;
    setError(null);
    setTxHash(null);
    setBusy("send");
    try {
      if (activeChainId !== plan.chainId) {
        setStatus(`Switching your wallet to ${plan.chainName}…`);
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
      setStatus(null);
    } catch (e) {
      setError(friendlyError(e, "Transaction failed"));
      setStatus(null);
    } finally {
      setBusy(null);
    }
  }

  const explorer = txHash ? explorerTxUrl(selection.chainId, txHash) : null;
  const destPretty = isAddress(destination.trim())
    ? getAddress(destination.trim())
    : destination.trim();

  return (
    <div className="panel" id="move">
      <h3 style={{ marginTop: 0 }}>
        Move {displayAmount(a.formatted)} {a.symbol} on {selection.chainName}
      </h3>
      <ol className="steps">
        <li className={sameWallet ? "done" : "active"}>Connect</li>
        <li className={verified ? "done" : sameWallet ? "active" : ""}>
          Prove ownership
        </li>
        <li className={txHash ? "done" : verified ? "active" : ""}>
          Review &amp; send
        </li>
      </ol>
      <p className="note">
        From: <span className="mono">{owner}</span>
      </p>

      {/* Step 1: connect the owning wallet */}
      {!isConnected && (
        <>
          <p>Connect the wallet that controls this address.</p>
          <ConnectChoices />
        </>
      )}

      {isConnected && !sameWallet && (
        <div className="callout">
          <p style={{ marginTop: 0 }}>
            Your wallet is connected as{" "}
            <span className="mono">{connected && shortAddress(connected)}</span>
            , but the funds are at{" "}
            <span className="mono">{shortAddress(owner)}</span>.
          </p>
          <p className="note">
            Switch to that account inside your wallet — this page updates
            automatically. If it&apos;s in a different wallet app, disconnect
            and connect that one.
          </p>
          <button className="secondary" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      )}

      {/* Step 2: prove ownership */}
      {sameWallet && !verified && (
        <>
          <button onClick={proveOwnership} disabled={busy !== null}>
            {busy === "verify"
              ? "Check your wallet…"
              : "Prove ownership (free, no gas)"}
          </button>
          <p className="note">
            Your wallet will ask you to sign a message. It moves nothing and
            costs nothing — it only proves you hold the key. Never sign anything
            here that your wallet shows as a transaction or an approval.
          </p>
        </>
      )}

      {/* Step 3: say where it goes, then review */}
      {sameWallet && verified && !txHash && (
        <>
          <label htmlFor="dest">Send to</label>
          <input
            id="dest"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x… where the funds should go"
            value={destination}
            onChange={(e) => {
              setDestination(e.target.value);
              resetPlan();
            }}
          />
          <p className="note">
            The address must accept {a.symbol} on{" "}
            <strong>{selection.chainName}</strong>. If it&apos;s an exchange
            deposit address, check the exchange lists the {selection.chainName}{" "}
            network for {a.symbol} — otherwise the funds get stuck again.
          </p>

          <label htmlFor="amt">Amount ({a.symbol})</label>
          <div className="row">
            <div>
              <input
                id="amt"
                type="text"
                inputMode="decimal"
                placeholder={useMax ? "" : "0.0"}
                value={useMax ? `All — ${displayAmount(a.formatted)}` : amount}
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
          <button
            onClick={review}
            disabled={busy !== null || !destination.trim()}
          >
            {busy === "review"
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
            <span className="mono">{destPretty}</span>
          </div>
          <div className="plan-row">
            <span>Network</span>
            <span>{plan.chainName}</span>
          </div>
          <div className="plan-row">
            <span>Network fee (at most)</span>
            <span className="mono">
              {displayAmount(plan.fee.formatted, 8)} {plan.fee.symbol}
              {!plan.fee.estimated && " (approx.)"}
            </span>
          </div>
          <div className="plan-row">
            <span>{plan.fee.symbol} available for fees</span>
            <span className="mono">
              {displayAmount(plan.nativeBalance.formatted, 8)}{" "}
              {plan.nativeBalance.symbol}
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
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmedNetwork}
                  onChange={(e) => setConfirmedNetwork(e.target.checked)}
                />
                <span>
                  I&apos;ve checked that {shortAddress(destPretty)} accepts{" "}
                  {plan.amount.symbol} on {plan.chainName}.
                </span>
              </label>
              <button
                onClick={send}
                disabled={busy !== null || !confirmedNetwork}
              >
                {busy === "send" ? "Check your wallet…" : "Send in wallet"}
              </button>
              <p className="note">
                Your wallet shows this exact transaction. Check the destination
                there before confirming.
              </p>
            </>
          )}
        </div>
      )}

      {txHash && (
        <div className="plan">
          <p
            className={receipt.data?.status === "reverted" ? "error" : "ok"}
            style={{ marginTop: 0 }}
          >
            {receipt.data?.status === "success"
              ? `Done — ${plan?.amount.formatted ?? ""} ${plan?.amount.symbol ?? ""} sent.`
              : receipt.data?.status === "reverted"
                ? "The transaction failed on-chain. Nothing moved; only the fee was spent."
                : "Sent. Waiting for the network to confirm…"}
          </p>
          <p className="note">
            Transaction: <span className="mono">{txHash}</span>
            {explorer && (
              <>
                {" "}
                <a href={explorer} target="_blank" rel="noreferrer">
                  View on explorer ↗
                </a>
              </>
            )}
          </p>
          {receipt.data && (
            <button className="secondary" onClick={onMoved}>
              Scan again / move something else
            </button>
          )}
        </div>
      )}

      {status && !txHash && <p className="ok">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
