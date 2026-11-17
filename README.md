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
         submit signature ─► /api/verify    (recovers signer, confirms match)
                    │
            ownership proven ──► build + send transfer (client-side)
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
- `ALCHEMY_API_KEY` — enables full ERC-20 scanning on every supported chain. If
  unset, the scan still runs but only sees the curated tokens in
  `src/lib/tokens.ts`.
- `RPC_<chainId>` (optional) — override the public RPCs if you hit rate limits.

Run it:

```bash
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
```

## What's deliberately minimal (and where to grow it)

- **Token coverage.** With `ALCHEMY_API_KEY` set, the scan finds **any** ERC-20
  via the Alchemy Token API (`src/lib/indexer.ts`). Without a key, it falls back
  to the small curated list in `src/lib/tokens.ts` (USDT/USDC/DAI on ETH,
  USDT/BUSD/USDC on BSC). Native balances are scanned on all chains either way.
  Spam-token filtering is basic (drops tokens with no symbol/decimals) — tighten
  it with Alchemy's spam flags if the lists get noisy.
- **Session token.** `/api/verify` issues a random token on success. For
  production, make it a signed JWT with an expiry and check it in a server-side
  "build transfer" step before you trust that an address passed verification.
- **Gas problem.** To move a token off chain X, the address needs chain X's
  native coin for gas. The UI flags when there's none. A smoother path
  (gas estimation, a "fund gas" helper, or sponsored/meta-transactions) is the
  main product work beyond this scaffold.
- **Non-EVM chains.** This covers the EVM wrong-network case only — that's where
  shared address space creates the confusion. Solana / Bitcoin / Tron use
  different address formats and need separate handling.

## Guardrails baked in

- Read-only scan is separated from any action.
- Ownership is proven cryptographically, never by trusting user claims.
- Private keys / seeds are never requested, transmitted, or stored.
- The signature message states plainly that it authorizes nothing.
