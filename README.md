# Boli Recover

Self-custody recovery for crypto **sent on the wrong EVM network**.

On Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base and Avalanche the same
key controls the same address on every chain. "My USDT is stuck on BSC" almost
always means the funds are sitting at an address you already control — your
wallet just isn't showing that network. Boli Recover:

1. **Scans** an address on all 7 networks (read-only — no wallet needed).
2. **Verifies ownership** — you sign a free, harmless message in your wallet.
3. **Checks gas** — tells you exactly how much of the network's coin you need
   to pay the fee, and where to send it, if the address has none.
4. **Moves** the funds — the transaction is signed and sent by your wallet.

**It never asks for a seed phrase or private key, and never holds funds.**

## Run it

```bash
npm install
cp .env.example .env.local
# set SESSION_SECRET (the only required setting):
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.local
npm run dev                # http://localhost:3000
```

Open `/api/health` to see what's configured.

## Configuration

| Variable | Required | What it does |
| --- | --- | --- |
| `SESSION_SECRET` | **yes** | ≥32 random chars. Signs ownership challenges and the 15-min move session. |
| `ALCHEMY_API_KEY` | recommended | Scan finds **any** ERC-20. Without it: native coins + ~60 curated tokens. |
| `RPC_<chainId>` | recommended | Your own RPC(s), tried before the built-in public ones. Comma-separate several. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | optional | Makes each ownership challenge single-use across all server instances (default: per instance, in memory). Apply `supabase/migrations/*` first. |
| `TOKENS_<chainId>` | optional | Extra token contracts to check on a chain, comma-separated. |

The app works with **only `SESSION_SECRET`** set: public RPCs, curated tokens,
in-memory replay protection.

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel (framework: Next.js — no
   extra settings).
2. Add `SESSION_SECRET` (and any optional variables) under
   *Settings → Environment Variables*.
3. Deploy, then open `https://<your-domain>/api/health` — it should say
   `"ok": true`.
4. Do one real recovery with a small amount before announcing it (see
   *Production checklist*).

Any Node host works the same way: `npm run build && npm start`.

## Production checklist

- [ ] `SESSION_SECRET` set (health check `ok: true`).
- [ ] Keyed RPCs (`RPC_<chainId>`) or `ALCHEMY_API_KEY` — public RPCs throttle
      under real traffic, and a throttled chain shows as "Couldn't check".
- [ ] Supabase configured if you run more than one server instance.
- [ ] Smoke test on mainnet with a small amount: scan → prove → move a token
      from an address with no gas (top up, re-check, send).
- [ ] Your domain on the challenge message matches what users see in the
      address bar (it's taken from the request host).

## How it's built

```
scan  ── POST /api/scan       read-only, all 7 chains, per-chain status
prove ── POST /api/challenge  server-signed challenge (stateless)
         POST /api/verify     recover signer → single-use → 15-min session
move  ── POST /api/transfer   session required: builds unsigned tx, worst-case
                              fee, gas shortfall, destination checks
         wallet               browser checks tx == what you typed, wallet signs
```

Next.js 14 (App Router), wagmi/viem, optional Supabase. See `CLAUDE.md` for the
architecture and conventions.

## Tests

```bash
npm test          # unit + integration (spins up a local chain in-process)
npm run typecheck
npm run lint
npm run build
```

The integration test runs the whole recovery through the real API handlers on a
local chain: scan finds a stuck token with zero gas → real signature proves
ownership (replay refused) → plan reports the gas shortfall → top up → plan is
checked and signed → tokens arrive.

## Guardrails

- Never requests, transmits or stores a seed phrase or private key.
- Read-only scan is separate from anything that moves value.
- The server won't build a transfer without fresh signed proof of ownership for
  that exact address.
- The browser refuses a server-built transaction that doesn't match what the
  user typed (network, asset, destination, amount, function).
- The signed message states plainly that it authorizes nothing.
- Destinations that lose funds are refused (zero address, the token contract,
  the same address); mis-cased addresses (likely typos) are rejected; contract
  destinations warn; the user must confirm the destination supports the network.
- Likely-spam tokens are hidden and never offered a Move button.
- No promises to recover stolen funds; the FAQ says so and warns about
  "recovery" scams.

## Not in scope (yet)

- Paying gas for the user (ERC-4337 paymaster / EIP-7702 sponsorship).
- WalletConnect (mobile users open the site in their wallet's in-app browser).
- Non-EVM chains (Solana, Bitcoin, Tron).
- Funds sent to an exchange's deposit address — only the exchange can move those.
