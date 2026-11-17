import { getAddress, isAddress } from "viem";
import { bearerToken, verifySession } from "@/lib/session";
import {
  buildTransfer,
  TransferError,
  type TransferAsset,
} from "@/lib/transfer";

export const runtime = "nodejs";
export const maxDuration = 30;

// Builds (never signs or sends) a transfer out of a verified address.
//
// Behind the ownership gate: requires the session token /api/verify issued,
// and that token must be for the same address the funds are moving from. The
// returned transaction is signed in the user's own wallet.
export async function POST(req: Request) {
  let sessionOwner;
  try {
    sessionOwner = verifySession(bearerToken(req));
  } catch (err) {
    // Server misconfiguration (no SESSION_SECRET) — not the user's fault.
    const message = err instanceof Error ? err.message : "Session check failed";
    return Response.json({ error: message }, { status: 500 });
  }
  if (!sessionOwner) {
    return Response.json(
      {
        error: "Ownership proof missing or expired. Prove ownership again.",
        reverify: true,
      },
      { status: 401 },
    );
  }

  let body: {
    owner?: string;
    chainId?: number;
    asset?: { kind?: string; address?: string };
    to?: string;
    amount?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { owner, chainId, asset, to, amount } = body;
  if (!owner || !isAddress(owner)) {
    return Response.json({ error: "Invalid owner address" }, { status: 400 });
  }
  if (getAddress(owner) !== sessionOwner) {
    return Response.json(
      {
        error: "Ownership was proven for a different address.",
        reverify: true,
      },
      { status: 403 },
    );
  }
  if (typeof chainId !== "number") {
    return Response.json({ error: "Missing chainId" }, { status: 400 });
  }
  if (!to || !isAddress(to)) {
    return Response.json(
      { error: "Enter a valid destination address." },
      { status: 400 },
    );
  }
  if (typeof amount !== "string") {
    return Response.json({ error: "Missing amount" }, { status: 400 });
  }

  let parsedAsset: TransferAsset;
  if (asset?.kind === "native") {
    parsedAsset = { kind: "native" };
  } else if (
    asset?.kind === "token" &&
    asset.address &&
    isAddress(asset.address)
  ) {
    parsedAsset = { kind: "token", address: getAddress(asset.address) };
  } else {
    return Response.json({ error: "Invalid asset" }, { status: 400 });
  }

  try {
    const plan = await buildTransfer({
      owner: sessionOwner,
      chainId,
      asset: parsedAsset,
      to: getAddress(to),
      amount,
    });
    return Response.json(plan);
  } catch (err) {
    if (err instanceof TransferError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    const message =
      err instanceof Error ? err.message : "Could not build transfer";
    return Response.json({ error: message }, { status: 502 });
  }
}
