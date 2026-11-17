import { isAddress, getAddress } from "viem";
import { issueChallenge } from "@/lib/ownership";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Issues a harmless message for the wallet to sign, plus a server-signed
// challenge token that /api/verify uses to rebuild that exact message.
export async function POST(req: Request) {
  const limited = rateLimit(req, "challenge", 20, 60_000);
  if (limited) return limited;

  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address } = body;
  if (!address || !isAddress(address)) {
    return Response.json(
      { error: "Enter a valid EVM address" },
      { status: 400 },
    );
  }

  try {
    const domain = new URL(req.url).host;
    return Response.json(issueChallenge(getAddress(address), domain));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create challenge";
    return Response.json({ error: message }, { status: 500 });
  }
}
