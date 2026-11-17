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
    scan.ts          orchestrates native + token scan per chain
    ownership.ts     challenge message builder + viem signature recovery
    supabaseServer.ts service-role Supabase client (server-only)
  app/
    api/scan/        POST: read-only multi-chain balance scan
    api/challenge/   POST: issue an ownership nonce (stored in Supabase)
    api/verify/      POST: recover signer, confirm match, mark verified
    page.tsx         orchestrates ScanForm -> ResultsTable -> VerifyAndMove
    providers.tsx    wagmi + react-query providers
  components/
    ScanForm.tsx       address input -> /api/scan
    ResultsTable.tsx   per-chain balances, "Move this" select
    VerifyAndMove.tsx  connect -> prove ownership -> transfer (client-signed)
  wagmi.ts           client wagmi config (injected connector)
supabase/migrations/ ownership_challenges table + RLS
```

Data flow: scan is server-side over public RPCs / Alchemy. Ownership
verification is server-side (viem `recoverMessageAddress`). The move transaction
is built and signed **client-side** in the user's wallet — the backend never
holds keys or sends value.

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

## Next up (not yet built)

1. **Gas problem** — a user with a stuck token but no native gas on that chain
   can't move it. Add gas estimation + a "fund gas" path (or sponsored/meta-tx).
2. **Session token hardening** — `/api/verify` returns a random token; promote
   to a signed JWT with expiry and check it in a server-side "build transfer"
   step before trusting that an address passed verification.
3. **Spam filtering** — use Alchemy spam flags to clean noisy token lists.
4. **Non-EVM** — Solana / Bitcoin / Tron need separate address + signing paths.
