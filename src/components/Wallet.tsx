"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, type Connector } from "wagmi";
import { shortAddress } from "@/lib/planCheck";

// Wallets announced by the browser (EIP-6963: MetaMask, Rabby, Trust, Coinbase
// extension…) plus the generic injected fallback. The generic one is hidden
// when a named wallet is present, since it points at the same provider.
function useWalletChoices(): readonly Connector[] {
  const { connectors } = useConnect();
  const named = connectors.filter((c) => c.id !== "injected");
  return named.length > 0 ? named : connectors;
}

// Hydration-safe: wallet discovery only happens in the browser.
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function ConnectChoices({ compact = false }: { compact?: boolean }) {
  const mounted = useMounted();
  const choices = useWalletChoices();
  const { connect, isPending, variables, error } = useConnect();
  const [hasProvider, setHasProvider] = useState(true);

  useEffect(() => {
    const injected =
      typeof window !== "undefined" &&
      Boolean((window as { ethereum?: unknown }).ethereum);
    setHasProvider(injected || choices.some((c) => c.id !== "injected"));
  }, [choices]);

  if (!mounted) return null;

  if (!hasProvider) {
    return (
      <div className="wallet-missing">
        <p>
          <strong>No wallet found in this browser.</strong>
        </p>
        <p className="note" style={{ marginTop: 4 }}>
          On a phone, open this page inside your wallet app&apos;s built-in
          browser (MetaMask, Trust Wallet, Coinbase Wallet, Rabby…). On a
          computer, install a wallet extension and reload.
        </p>
      </div>
    );
  }

  const pendingId =
    isPending && variables && "id" in variables.connector
      ? variables.connector.id
      : null;

  return (
    <div className={compact ? "wallet-choices compact" : "wallet-choices"}>
      {choices.map((c) => (
        <button
          key={c.uid}
          className={compact ? "secondary" : undefined}
          onClick={() => connect({ connector: c })}
          disabled={isPending}
        >
          {c.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.icon}
              alt=""
              width={18}
              height={18}
              className="wallet-icon"
            />
          )}
          {pendingId === c.id
            ? "Check your wallet…"
            : c.id === "injected"
              ? "Connect wallet"
              : `Connect ${c.name}`}
        </button>
      ))}
      {error && !isPending && (
        <p className="error" style={{ width: "100%" }}>
          {/rejected|denied/i.test(error.message)
            ? "Connection request was declined in the wallet."
            : error.message.split("\n")[0]}
        </p>
      )}
    </div>
  );
}

export function WalletButton() {
  const mounted = useMounted();
  const { address, isConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (!mounted) return <div className="wallet-slot" />;

  if (isConnected && address) {
    return (
      <div className="wallet-slot">
        <span className="pill gas-ok" title={address}>
          {connector && connector.id !== "injected"
            ? `${connector.name} · `
            : ""}
          {shortAddress(address)}
        </span>
        <button className="link" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-slot">
      {open ? (
        <ConnectChoices compact />
      ) : (
        <button className="secondary" onClick={() => setOpen(true)}>
          Connect wallet
        </button>
      )}
    </div>
  );
}
