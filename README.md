# Boli Recover

Self-custody recovery for crypto **stuck on the wrong EVM network**.

On EVM chains (Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche) the
same private key controls the same address on every chain. So "my USDT is stuck
on BSC" almost always means the funds are sitting at an address you already
control — your wallet just isn't showing that chain. This app:

1. **Scans** an address across chains (read-only, no wallet, no signature).
2. **Verifies ownership** — you sign a message proving you hold the key. The
   private key / seed never leaves your wallet and is never sent anywhere.
3. **Moves** the funds out — the transfer is signed client-side in your wallet.

**It never asks for a seed phrase or private key.** That is the whole point, and
the line that separates this from the recovery scams this space is full of.

## Flow

```
paste address ──► /api/scan (read-only)
                    │
                    ▼
            see what's stuck on each chain
                    │
          pick an asset ──► connect wallet
                    │
         sign challenge ──► /api/challenge  (issues a nonce)
                    │
         submit signature ─► /api/verify    (recovers signer, issues 15-min session)
                    │
      destination + amount ─► /api/transfer (session required: builds tx,
                    │                        estimates fee, checks gas)
                    │
        not enough gas? ──► "send X ETH to this address on this network",
                    │        then Re-check
                    │
       wallet signs + sends (client-side, after checking the tx matches)
```

## Stack

- **Next.js** (App Router) + **wagmi** / **viem** for wallet + chain access
- **Supabase** (Postgres) for ownership-challenge nonces
- **Vercel** for hosting

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
```

Apply the database migration (Supabase SQL editor, or the CLI):

```
supabase/migrations/0001_ownership_challenges.sql
```

Fill `.env.local`:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — server-only, used by the API
  routes. The service-role key must never reach the browser; it only lives in
  the `/api/*` route handlers.
- `SESSION_SECRET` — server-only, at least 32 random characters
  (`openssl rand -hex 32`). Signs the short-lived ownership session.
- `ALCHEMY_API_KEY` — enables full ERC-20 scanning on every supported chain. If
  unset, the scan still runs but only sees the curated tokens in
  `src/lib/tokens.ts`.
- `RPC_<chainId>` (optional) — override the public RPCs if you hit rate limits.

Run it:

```bash
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```

## What's built, and where to grow it

- **Token coverage.** With `ALCHEMY_API_KEY` set, the scan finds **any** ERC-20
  via the Alchemy Token API (`src/lib/indexer.ts`). Without a key, it falls back
  to the small curated list in `src/lib/tokens.ts` (USDT/USDC/DAI on ETH,
  USDT/BUSD/USDC on BSC). Native balances are scanned on all chains either way.
- **Spam filtering.** Tokens whose name or symbol is an advert (links, "claim",
  "airdrop", emoji) are flagged by `src/lib/spam.ts`, hidden behind a "show"
  toggle, and never offered a Move button — touching them is how those scams
  work. Heuristic; swap in a provider's spam list if needed.
- **Session token.** `/api/verify` consumes the challenge (single use) and
  returns a 15-minute HS256 token for that address. `/api/transfer` refuses to
  build a transaction without a valid token for the same address.
- **Gas.** `/api/transfer` estimates the worst-case fee (including the L1 data
  fee on Optimism/Base) and passes the same fee caps to the wallet, so "Max"
  native sends always leave enough for gas. If the address can't pay, the UI
  says exactly how much native coin to send, to which address, on which
  network, then re-checks. Paying the fee for the user (ERC-4337 / EIP-7702
  sponsorship) is the next step up.
- **Destination checks.** Refuses the zero address, the token's own contract,
  and the same address; warns when the destination is a contract; reminds the
  user to check the destination supports this network.
- **Non-EVM chains.** This covers the EVM wrong-network case only — that's where
  shared address space creates the confusion. Solana / Bitcoin / Tron use
  different address formats and need separate handling.

## Guardrails baked in

- Read-only scan is separated from any action.
- Ownership is proven cryptographically, never by trusting user claims, and the
  server won't build a transfer without that proof for the same address.
- The browser checks the server-built transaction matches what the user typed
  before the wallet is asked to sign it.
- Private keys / seeds are never requested, transmitted, or stored.
- The signature message states plainly that it authorizes nothing.
