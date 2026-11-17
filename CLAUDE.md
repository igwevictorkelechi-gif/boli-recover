# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

**Boli Recover** — a self-custody tool for crypto stuck on the wrong EVM
network. On EVM chains the same private key controls the same address on every
chain, so "funds stuck on the wrong network" means they sit at an address the
user already controls; their wallet just isn't showing that chain. The app
finds those funds and helps move them out.

## Non-negotiable guardrails (read before building features)

This product lives next to a category full of scams. Keep it on the right side:

- **Never request, transmit, or store a seed phrase or private key.** Ownership
  is proven by the user signing a message in their own wallet — nothing more.
  Any feature that asks for secret material is wrong, full stop.
- **Only ever act on wallets the user proves they own.** No feature should help
  access, scan-to-drain, or "recover" funds for an address the user hasn't
  cryptographically verified control of. We don't crack keys; we don't touch
  other people's wallets.
- **Keep read-only separate from actions.** The scan proves nothing and moves
  nothing. Anything that moves value sits behind the ownership gate.
- **Signatures must stay harmless.** The challenge message states plainly that
  it authorizes no transaction. Never introduce a flow that tricks a user into
  signing a transfer/approval under the guise of "verification."
- **No deceptive UX.** No fake urgency, no impersonation, no promises to recover
  stolen/scammed funds (that case is not what this tool does).

If a request would cross these lines, stop and flag it rather than implementing.

## Architecture

```
src/
  lib/
    rpcs.ts          public RPC fallback list (shared by server + browser)
    chains.ts        supported chains, fallback transports, RPC_<id> overrides
    tokens.ts        curated token list (checksums guarded by tests)
    indexer.ts       Alchemy Token API — full ERC-20 coverage when keyed
    spam.ts          heuristic spam-token flags
    scan.ts          native + token scan per chain, per-chain status/timeout
    secret.ts        purpose-separated HMAC keys derived from SESSION_SECRET
    ownership.ts     stateless signed challenge + signature recovery
    nonceStore.ts    single-use challenges (Supabase, else in-memory)
    session.ts       15-min HS256 session: issued on verify, required to move
    transfer.ts      builds unsigned transfer, worst-case fee, gas shortfall
    planCheck.ts     client-safe: verify server tx == user intent; formatting
    rateLimit.ts     per-IP fixed-window limiter (in-memory)
    supabaseServer.ts optional service-role client (server-only)
  app/
    api/scan|challenge|verify|transfer|health
    page.tsx         scan -> results -> move panel, how-it-works, FAQ
    error.tsx        crash screen (reassures nothing moved)
  components/
    Wallet.tsx         wallet picker (EIP-6963) + header button
    ScanForm.tsx       address input, "scan my connected wallet"
    ResultsTable.tsx   found / couldn't-check / empty chains, spam toggle
    VerifyAndMove.tsx  connect -> prove -> review -> (fund gas) -> confirm -> send
    Info.tsx           how it works + FAQ (static)
tests/unit, tests/integration (ganache in-process, real route handlers)
supabase/migrations/ optional; 0002 makes nonces unique
```

Flow: `/api/scan` is read-only and returns all 7 chains, each with assets
and/or an `error` — never present "couldn't check" as "empty". `/api/challenge`
returns a message plus a server-signed challenge token; `/api/verify` rebuilds
the message from the token (never trusts a client-sent message), recovers the
signer, consumes the nonce, and returns a session. `/api/transfer` requires the
session for the same address, reads live balances, estimates gas (+ OP-stack L1
fee), and returns an unsigned tx with exact fee caps and any shortfall. The
browser runs `planMismatch` before handing the tx to the wallet. The backend
never holds keys or sends value.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000  (needs SESSION_SECRET in .env.local)
npm test           # vitest: unit + integration (local chain, no network)
npm run typecheck  # run before committing
npm run lint
npm run build
```

## Environment

Only `SESSION_SECRET` (≥32 chars) is required. Optional: `ALCHEMY_API_KEY`,
`RPC_<chainId>` (comma list), `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
`TOKENS_<chainId>`. `/api/health` reports what's set (never values).

## Conventions

- TypeScript strict. viem for all chain/crypto; wagmi v2 for wallet hooks.
- Balances cross the API as base-unit **integer strings** (`raw`), never JS
  floats. Display with `displayAmount` (truncates, never rounds up).
- Validate addresses with viem's strict `isAddress`: all-lowercase or a valid
  checksum. A mixed-case address with a bad checksum is a likely typo — reject.
- Scans fail soft per chain, and say so (`error`).
- A multicall where every call fails is treated as "multicall unavailable",
  not "zero balance" (falls back to individual reads).
- Spam tokens are flagged, never moved. Keep `spam.ts` narrow.
- Import connectors from `wagmi` root, not the `wagmi/connectors` barrel (it
  pulls in the Coinbase SDK whose optional x402 deps break `next build`).
- New HMAC uses get their own `Purpose` in `secret.ts`.

## Next up (not yet built)

1. **Sponsored gas** (ERC-4337 paymaster / EIP-7702) so users needn't top up.
2. **WalletConnect** for mobile browsers outside wallet apps (needs a project
   id; import the connector directly, keep `next build` green).
3. **Shared rate limiting** (e.g. Upstash) for multi-instance deploys.
4. **Better spam data** — a provider spam list or token-list allow-list.
5. **Non-EVM** — Solana / Bitcoin / Tron need separate address + signing paths.
