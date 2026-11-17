import { isAddress, getAddress } from "viem";
import { scanAddress } from "@/lib/scan";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

// Read-only. Anyone can scan any address — proving nothing, moving nothing.
// This is the "show the problem before you commit" step.
export async function POST(req: Request) {
  const limited = rateLimit(req, "scan", 10, 60_000);
  if (limited) return limited;

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = body.address?.trim();
  if (!address || !isAddress(address)) {
    return Response.json(
      { error: "Enter a valid EVM address (0x…)" },
      { status: 400 },
    );
  }

  try {
    const checksummed = getAddress(address);
    const results = await scanAddress(checksummed);
    return Response.json({ address: checksummed, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
