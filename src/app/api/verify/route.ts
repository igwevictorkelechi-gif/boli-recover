import { randomBytes } from "crypto";
import { isAddress, getAddress } from "viem";
import { verifySignature } from "@/lib/ownership";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { address?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, signature } = body;
  if (!address || !isAddress(address) || !signature) {
    return Response.json(
      { error: "Missing address or signature" },
      { status: 400 },
    );
  }

  const addr = getAddress(address);

  try {
    const sb = supabaseAdmin();

    // Most recent still-valid, unverified challenge for this address.
    const { data, error } = await sb
      .from("ownership_challenges")
      .select("*")
      .eq("address", addr.toLowerCase())
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const row = data?.[0];
    if (!row) {
      return Response.json(
        { verified: false, error: "No active challenge. Request a new one." },
        { status: 400 },
      );
    }

    const ok = await verifySignature({
      message: row.message as string,
      signature: signature as `0x${string}`,
      address: addr,
    });

    if (!ok) {
      return Response.json(
        { verified: false, error: "Signature does not match this address" },
        { status: 401 },
      );
    }

    const token = randomBytes(32).toString("hex");
    await sb
      .from("ownership_challenges")
      .update({ verified_at: new Date().toISOString(), session_token: token })
      .eq("id", row.id);

    // The token proves this address passed ownership verification. The move UI
    // unlocks on it. For production, promote this to a signed JWT with an
    // expiry and check it in a server-side "build transfer" endpoint.
    return Response.json({ verified: true, token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
