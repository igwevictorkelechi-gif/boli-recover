import { recoverMessageAddress, getAddress, type Address } from "viem";

// The message the user signs to prove they control an address. It is explicit
// that signing moves nothing and costs nothing — important so the user (and
// their wallet's phishing warnings) can see this is a safe signature.
export function buildChallengeMessage(o: {
  address: Address;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    "Boli Recover — prove wallet ownership",
    "",
    `Address: ${o.address}`,
    `Nonce: ${o.nonce}`,
    `Issued: ${o.issuedAt}`,
    "",
    "Signing proves you control this wallet.",
    "It authorizes no transaction, moves no funds, and costs no gas.",
  ].join("\n");
}

// Recover the signer from the signature and confirm it matches the claimed
// address. The private key never leaves the user's wallet.
export async function verifySignature(o: {
  message: string;
  signature: `0x${string}`;
  address: Address;
}): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({
      message: o.message,
      signature: o.signature,
    });
    return getAddress(recovered) === getAddress(o.address);
  } catch {
    return false;
  }
}
