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
    chains.ts        supported EVM chains (viem) + per-chain RPC override
    tokens.ts        curated token fallback list (no-API-key path)
    indexer.ts       Alchemy Token API — full ERC-20 coverage when keyed
    spam.ts          heuristic spam-token flags (links/lure words in metadata)
    scan.ts          orchestrates native + token scan per chain
    ownership.ts     challenge message builder + viem signature recovery
    session.ts       HS256 session token: issued on verify, required to move
    transfer.ts      builds an unsigned transfer + gas/fee + shortfall check
    supabaseServer.ts service-role Supabase client (server-only)
  app/
    api/scan/        POST: read-only multi-chain balance scan
    api/challenge/   POST: issue an ownership nonce (stored in Supabase)
    api/verify/      POST: recover signer, consume challenge, issue session
    api/transfer/    POST: (session required) build tx, estimate fee, gas check
    page.tsx         orchestrates ScanForm -> ResultsTable -> VerifyAndMove
    providers.tsx    wagmi + react-query providers
  components/
    ScanForm.tsx       address input -> /api/scan
    ResultsTable.tsx   per-chain balances, "Move this" select, spam hidden
    VerifyAndMove.tsx  connect -> prove ownership -> review -> (fund gas) -> send
  wagmi.ts           client wagmi config (injected connector)
supabase/migrations/ ownership_challenges table + RLS
```

Data flow: scan is server-side over public RPCs / Alchemy. Ownership
verification is server-side (viem `recoverMessageAddress`); success consumes
the challenge (single use) and returns a 15-minute HS256 session token for that
address. `/api/transfer` refuses to build anything without a valid token for
the **same** address the funds move from. It returns an unsigned transaction,
the worst-case network fee, and any gas shortfall. The client re-checks that the
transaction matches what the user typed (network, asset, destination, amount)
before handing it to the wallet, and the wallet signs and sends it. The backend
never holds keys or sends value.

Gas: the plan's fee is `gas limit × maxFeePerGas` (+ the L1 data fee on
Optimism/Base, with headroom), and those exact fee caps are passed to the
wallet, so a "Max" native send can't be pushed over the balance. When the
address can't cover the fee, the UI shows exactly how much native coin to send,
to which address, on which network, and a Re-check button.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit  (run before committing)
npm run build
```

## Environment

Copy `.env.example` to `.env.local`:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-only; the service-role
  key must never reach the browser.
- `SESSION_SECRET` — server-only, ≥32 random chars; signs the ownership session
  token. Without it, verification and the move step fail with a 500.
- `ALCHEMY_API_KEY` — enables full ERC-20 scanning; without it, curated tokens
  only.
- `RPC_<chainId>` — optional public-RPC overrides.

Apply `supabase/migrations/0001_ownership_challenges.sql` to the Supabase
project before using the ownership flow.

## Conventions

- TypeScript strict. viem for all chain/crypto; wagmi v2 for wallet hooks.
- Balances cross the API as base-unit **integer strings** (`raw`), not numbers —
  never parse on-chain amounts into JS floats.
- API routes validate addresses with `isAddress` and checksum with `getAddress`.
- Scans fail soft: an RPC/indexer error on one chain skips that chain rather
  than failing the whole scan.
- Spam tokens are flagged, not dropped, and are never offered a "Move" button.
  Keep `spam.ts` rules narrow — a false positive hides someone's real funds.
- Import wallet connectors from `wagmi` (root), not the `wagmi/connectors`
  barrel: the barrel pulls in the Coinbase/Base SDK, whose optional x402
  packages aren't installed and break `next build`.

## Next up (not yet built)

1. **Sponsored gas** — today the gas path tells the user exactly what to send
   and re-checks. A smoother path is paying the fee for them (ERC-4337 paymaster
   or EIP-7702), which needs a funded relayer and abuse limits.
2. **Better spam data** — `spam.ts` is heuristic. Swap in a provider's spam
   list (or a maintained token list as an allow-list) if false negatives show.
3. **Rate limiting** on `/api/challenge` and `/api/scan`.
4. **Drop `ownership_challenges.session_token`** — no longer written (the
   session is a signed token, not stored). Needs a migration.
5. **Non-EVM** — Solana / Bitcoin / Tron need separate address + signing paths.
