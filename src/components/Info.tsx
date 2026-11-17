// Static explainer content. No client state — renders on the server.

export function HowItWorks() {
  return (
    <section className="panel info" aria-labelledby="how">
      <h2 id="how">How it works</h2>
      <ol className="how">
        <li>
          <strong>Scan.</strong> Paste the address you sent to. We check it on 7
          networks. Read-only — nothing is signed or moved.
        </li>
        <li>
          <strong>Prove it&apos;s yours.</strong> Connect the wallet that owns
          that address and sign a free message. No gas, no transaction, no
          approval.
        </li>
        <li>
          <strong>Move it.</strong> Choose where the funds should go. We check
          the fee and tell you if you need a little gas first, then your wallet
          shows the transaction for you to confirm.
        </li>
      </ol>
    </section>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Why are my funds “stuck”?",
    a: (
      <>
        EVM networks (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base,
        Avalanche) share one address format. If you sent USDT &ldquo;on BNB
        Chain&rdquo; to your Ethereum address, it arrived — at the same address,
        on BNB Chain. Your wallet just isn&apos;t showing that network. The key
        you already have controls it.
      </>
    ),
  },
  {
    q: "I sent to an exchange deposit address on the wrong network.",
    a: (
      <>
        Then the funds are at an address the <em>exchange</em> controls, not you
        — this tool can&apos;t move them, and nobody else can either without the
        exchange. Contact the exchange&apos;s official support (from their
        website or app, never from a DM) with the transaction hash; many will
        recover wrong-network deposits, sometimes for a fee.
      </>
    ),
  },
  {
    q: "Why do I need gas to move a token?",
    a: (
      <>
        Every network charges its fee in its own coin — ETH on Ethereum,
        Arbitrum, Optimism and Base; BNB on BNB Chain; POL on Polygon; AVAX on
        Avalanche. To move USDT on BNB Chain, the address needs a little BNB. We
        tell you the exact amount; you can withdraw it from an exchange (choose
        the right network) or send it from another wallet.
      </>
    ),
  },
  {
    q: "Is it safe to sign the ownership message?",
    a: (
      <>
        Yes — it&apos;s a plain text message that says it authorizes nothing.
        Your wallet will show it as a <em>signature request</em>, not a
        transaction. If a site ever asks you to sign something your wallet shows
        as a transaction, a token approval, or a &ldquo;permit&rdquo; in order
        to &ldquo;verify&rdquo;, stop.
      </>
    ),
  },
  {
    q: "Will you ever ask for my seed phrase?",
    a: (
      <>
        Never. Nothing legitimate needs it. Anyone who asks for your recovery
        phrase or private key — a website, an app, &ldquo;support&rdquo; on
        Telegram or X — is trying to empty your wallet.
      </>
    ),
  },
  {
    q: "My funds were stolen or I was scammed. Can you recover them?",
    a: (
      <>
        No. This tool only helps you move funds that are still at an address you
        control. Be wary of anyone promising to recover stolen crypto for a fee
        — that is a very common second scam. Report theft to your local police
        and the platform involved.
      </>
    ),
  },
  {
    q: "What about Solana, Bitcoin or Tron?",
    a: (
      <>
        Not supported. They use different address formats, so funds can&apos;t
        land on them by the same mistake. If you sent to an incompatible chain
        through an exchange, contact that exchange.
      </>
    ),
  },
];

export function Faq() {
  return (
    <section className="panel info" aria-labelledby="faq">
      <h2 id="faq">Questions</h2>
      {FAQ.map(({ q, a }) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
    </section>
  );
}
