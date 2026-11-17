import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { estimateL1Fee } from "viem/op-stack";
import { CHAIN_BY_ID, clientFor } from "./chains";

// Server-side "build transfer" step.
//
// Only called for an address that passed the ownership check (the route
// enforces that with the session token). Reads live balances, estimates gas,
// and returns an unsigned transaction plus a plain answer to "can this address
// pay for it?". It signs nothing and sends nothing — the user's wallet does.

export type TransferAsset =
  | { kind: "native" }
  | { kind: "token"; address: Address };

export type TransferRequest = {
  owner: Address;
  chainId: number;
  asset: TransferAsset;
  to: Address;
  amount: string; // base-unit integer string, or "max"
};

type Amount = { raw: string; formatted: string; symbol: string };

export type TransferPlan = {
  chainId: number;
  chainName: string;
  from: Address;
  tx: {
    to: Address;
    data?: Hex;
    value: string; // wei, integer string
    gas: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gasPrice?: string;
  };
  amount: Amount;
  fee: Amount & { estimated: boolean };
  nativeBalance: Amount;
  // How much more native coin the address needs before this can be sent.
  shortfall: Amount | null;
  warnings: string[];
};

export class TransferError extends Error {}

// Plain native sends to an account with no code always use exactly this much.
const NATIVE_TRANSFER_GAS = 21_000n;
// Used only if the node refuses to estimate a token transfer.
const FALLBACK_TOKEN_GAS = 100_000n;

function bufferGas(gas: bigint): bigint {
  // 20% headroom: estimates are taken against current state, which can shift.
  return gas <= NATIVE_TRANSFER_GAS ? gas : (gas * 12n) / 10n;
}

function parseAmount(amount: string): bigint | "max" {
  if (amount === "max") return "max";
  if (!/^\d+$/.test(amount)) throw new TransferError("Invalid amount.");
  const v = BigInt(amount);
  if (v <= 0n) throw new TransferError("Amount must be greater than zero.");
  return v;
}

export async function buildTransfer(
  req: TransferRequest,
): Promise<TransferPlan> {
  const chain = CHAIN_BY_ID[req.chainId];
  if (!chain) throw new TransferError("Unsupported network.");
  const client = clientFor(chain);

  const owner = getAddress(req.owner);
  const to = getAddress(req.to);
  const native = chain.nativeCurrency;
  const warnings: string[] = [];

  // Destination sanity checks — these catch mistakes that lose funds for good.
  if (to === zeroAddress) {
    throw new TransferError(
      "That is the zero address; anything sent there is burned.",
    );
  }
  if (to === owner) {
    throw new TransferError(
      "Destination is the same address the funds are already at. Use a different address.",
    );
  }
  if (req.asset.kind === "token") {
    if (!isAddress(req.asset.address))
      throw new TransferError("Invalid token address.");
    if (getAddress(req.asset.address) === to) {
      throw new TransferError(
        "Destination is the token's own contract. Tokens sent there are almost always lost.",
      );
    }
  }

  const requested = parseAmount(req.amount);

  const [nativeBal, toCode] = await Promise.all([
    client.getBalance({ address: owner }),
    client.getCode({ address: to }).catch(() => undefined),
  ]);
  const destIsContract = Boolean(toCode && toCode !== "0x");
  if (destIsContract) {
    warnings.push(
      "The destination is a smart contract, not a regular wallet. Only continue if you know it accepts this asset on this network.",
    );
  }

  // --- Build the call -------------------------------------------------------
  let txTo: Address;
  let data: Hex | undefined;
  let tokenAmount: bigint | null = null;
  let symbol: string;
  let decimals: number;

  if (req.asset.kind === "token") {
    const token = getAddress(req.asset.address);
    const [bal, sym, dec] = await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      }),
      client
        .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
        .catch(() => "tokens"),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ]);
    symbol = sym;
    decimals = Number(dec);
    if (bal <= 0n)
      throw new TransferError(
        `This address holds no ${symbol} on ${chain.name}.`,
      );
    tokenAmount = requested === "max" ? bal : requested;
    if (tokenAmount > bal) {
      throw new TransferError(
        `Amount is more than the balance (${formatUnits(bal, decimals)} ${symbol}).`,
      );
    }
    txTo = token;
    data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, tokenAmount],
    });
  } else {
    symbol = native.symbol;
    decimals = native.decimals;
    txTo = to;
  }

  // --- Gas ------------------------------------------------------------------
  let gas: bigint;
  let estimated = true;
  if (req.asset.kind === "native" && !destIsContract) {
    gas = NATIVE_TRANSFER_GAS;
  } else {
    try {
      // Value 0 for native: the gas a send uses doesn't depend on the amount,
      // and estimating with the real amount fails when it's the full balance.
      gas = bufferGas(
        await client.estimateGas({ account: owner, to: txTo, data, value: 0n }),
      );
    } catch {
      if (req.asset.kind === "token") {
        // Some nodes won't simulate for an account with no gas money.
        gas = FALLBACK_TOKEN_GAS;
        estimated = false;
      } else {
        throw new TransferError(
          "The destination contract rejected a test send. It may not accept this asset.",
        );
      }
    }
  }

  // --- Fees -----------------------------------------------------------------
  // We pass these exact fee caps to the wallet, so the cost we reserve here is
  // the most the transaction can cost (besides the L1 fee below).
  let feePerGas: bigint;
  const feeFields: Pick<
    TransferPlan["tx"],
    "maxFeePerGas" | "maxPriorityFeePerGas" | "gasPrice"
  > = {};
  try {
    const fees = await client.estimateFeesPerGas({
      type: "eip1559",
      chain: undefined, // use the client's chain
    });
    feePerGas = fees.maxFeePerGas;
    feeFields.maxFeePerGas = fees.maxFeePerGas.toString();
    feeFields.maxPriorityFeePerGas = fees.maxPriorityFeePerGas.toString();
  } catch {
    // Chain without EIP-1559 fee data — fall back to a legacy gas price.
    const gp = await client.getGasPrice();
    feePerGas = (gp * 12n) / 10n;
    feeFields.gasPrice = feePerGas.toString();
  }
  let fee = gas * feePerGas;

  // OP-stack chains (Optimism, Base) also charge an L1 data fee, taken from the
  // balance on top of the gas above. Reserve it, with headroom.
  if (
    chain.sourceId &&
    chain.contracts &&
    "gasPriceOracle" in chain.contracts
  ) {
    try {
      const l1 = await estimateL1Fee(client, {
        account: owner,
        to: txTo,
        data,
        value: 0n,
        chain,
      });
      fee += (l1 * 15n) / 10n;
    } catch {
      warnings.push(
        "Couldn't estimate this network's L1 data fee; keep a little extra for gas.",
      );
      estimated = false;
    }
  }

  // --- Amount + affordability ----------------------------------------------
  let value = 0n;
  let shortfall = 0n;
  if (req.asset.kind === "native") {
    if (requested === "max") {
      value = nativeBal > fee ? nativeBal - fee : 0n;
      if (value === 0n) shortfall = fee - nativeBal + 1n;
    } else {
      value = requested;
      if (nativeBal < value + fee) shortfall = value + fee - nativeBal;
    }
  } else if (nativeBal < fee) {
    shortfall = fee - nativeBal;
  }

  const fmt = (raw: bigint, d: number, s: string): Amount => ({
    raw: raw.toString(),
    formatted: formatUnits(raw, d),
    symbol: s,
  });

  return {
    chainId: chain.id,
    chainName: chain.name,
    from: owner,
    tx: {
      to: txTo,
      data,
      value: value.toString(),
      gas: gas.toString(),
      ...feeFields,
    },
    amount:
      req.asset.kind === "native"
        ? fmt(value, decimals, symbol)
        : fmt(tokenAmount ?? 0n, decimals, symbol),
    fee: { ...fmt(fee, native.decimals, native.symbol), estimated },
    nativeBalance: fmt(nativeBal, native.decimals, native.symbol),
    shortfall:
      shortfall > 0n ? fmt(shortfall, native.decimals, native.symbol) : null,
    warnings,
  };
}
