import { hasSecret } from "@/lib/secret";
import { supabaseConfigured } from "@/lib/supabaseServer";
import { SCAN_CHAINS, rpcUrlsFor } from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuration check for operators. Reports what's set, never the values.
export async function GET() {
  const ready = hasSecret();
  return Response.json(
    {
      ok: ready,
      sessionSecret: ready
        ? "set"
        : "MISSING — ownership checks and moves will fail",
      tokenCoverage: process.env.ALCHEMY_API_KEY
        ? "indexer (any ERC-20)"
        : "curated list (set ALCHEMY_API_KEY for full coverage)",
      replayProtection: supabaseConfigured()
        ? "supabase (all instances)"
        : "in-memory (per instance)",
      chains: SCAN_CHAINS.map((c) => ({
        id: c.id,
        name: c.name,
        rpcs: rpcUrlsFor(c.id).length,
        customRpc: Boolean(process.env[`RPC_${c.id}`]),
      })),
    },
    { status: ready ? 200 : 503 },
  );
}
