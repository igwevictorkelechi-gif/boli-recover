// End-to-end through the real API route handlers, against a local chain
// (ganache, chainId 1) — no mocks. The "wallet" is a local viem account that
// signs exactly like a browser wallet would.
//
// Scenario: a user's 250 TUSD is stuck at their address with zero ETH for gas.
// Scan finds it → user proves ownership → transfer plan reports the gas
// shortfall → user tops up gas → plan is sendable → signed + broadcast →
// tokens arrive.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { TEST_TOKEN_BYTECODE } from "../fixtures/testToken";
import { planMismatch } from "@/lib/planCheck";
import { SCAN_CHAINS } from "@/lib/chains";
import type { TransferPlan } from "@/lib/transfer";
import { POST as scanPOST } from "@/app/api/scan/route";
import { POST as challengePOST } from "@/app/api/challenge/route";
import { POST as verifyPOST } from "@/app/api/verify/route";
import { POST as transferPOST } from "@/app/api/transfer/route";
import { GET as healthGET } from "@/app/api/health/route";

const PORT = 8611;
const RPC = `http://127.0.0.1:${PORT}`;
const server = ganache.server({
  chain: { chainId: 1 },
  wallet: { deterministic: true, totalAccounts: 3 },
  logging: { quiet: true },
});

const pub = createPublicClient({ chain: mainnet, transport: http(RPC) });
let funder: PrivateKeyAccount, user: PrivateKeyAccount, dest: PrivateKeyAccount;
let token: Address;
let ip = 0;

function wallet(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: mainnet, transport: http(RPC) });
}

// Each call gets its own fake IP so the rate limiter stays out of the way.
function call(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return handler(
    new Request("http://recover.test/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.0.0.${++ip}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function proveOwnership(account: PrivateKeyAccount): Promise<string> {
  const ch = await (
    await call(challengePOST, { address: account.address })
  ).json();
  expect(ch.message).toContain("recover.test");
  const signature = await account.signMessage({ message: ch.message });
  const res = await call(verifyPOST, {
    address: account.address,
    signature,
    challenge: ch.challenge,
  });
  const body = await res.json();
  expect(res.status, body.error).toBe(200);
  return body.token;
}

async function plan(session: string, req: Record<string, unknown>) {
  const res = await call(transferPOST, req, {
    authorization: `Bearer ${session}`,
  });
  return { status: res.status, body: await res.json() };
}

async function sendPlan(account: PrivateKeyAccount, p: TransferPlan) {
  const w = wallet(account);
  const base = {
    to: p.tx.to,
    data: p.tx.data,
    value: BigInt(p.tx.value),
    gas: BigInt(p.tx.gas),
  };
  const hash: Hex = p.tx.maxFeePerGas
    ? await w.sendTransaction({
        ...base,
        maxFeePerGas: BigInt(p.tx.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(p.tx.maxPriorityFeePerGas!),
      })
    : await w.sendTransaction({ ...base, gasPrice: BigInt(p.tx.gasPrice!) });
  return pub.waitForTransactionReceipt({ hash });
}

beforeAll(async () => {
  await server.listen(PORT);
  const keys = Object.values(server.provider.getInitialAccounts()).map(
    (a) => a.secretKey as Hex,
  );
  [funder, user, dest] = keys.map((k) => privateKeyToAccount(k));

  const deploy = await wallet(funder).deployContract({
    abi: [],
    bytecode: TEST_TOKEN_BYTECODE,
  });
  token = (await pub.waitForTransactionReceipt({ hash: deploy }))
    .contractAddress!;
  await pub.waitForTransactionReceipt({
    hash: await wallet(funder).writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [user.address, 250_000_000n],
    }),
  });
  // The stuck case: tokens, and no gas coin at all.
  await server.provider.request({
    method: "evm_setAccountBalance",
    params: [user.address, "0x0"],
  });

  vi.stubEnv("SESSION_SECRET", "integration-test-secret-0123456789abcdef");
  vi.stubEnv("RPC_1", RPC);
  vi.stubEnv("TOKENS_1", token);
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("ALCHEMY_API_KEY", "");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await server.close();
});

describe("wrong-network recovery flow", () => {
  let session = "";
  let tokenPlan: TransferPlan;

  it("health reports ready", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    expect((await res.json()).sessionSecret).toBe("set");
  });

  it("scan finds the stuck token and flags no gas (via the no-multicall fallback)", async () => {
    const res = await call(scanPOST, { address: user.address });
    const body = await res.json();
    expect(res.status).toBe(200);
    const eth = body.results.find((r: { chainId: number }) => r.chainId === 1);
    expect(eth.error).toBeUndefined();
    expect(eth.hasGas).toBe(false);
    expect(eth.assets).toEqual([
      expect.objectContaining({
        kind: "token",
        symbol: "TUSD",
        decimals: 6,
        raw: "250000000",
        formatted: "250",
      }),
    ]);
    expect(body.results).toHaveLength(SCAN_CHAINS.length); // every chain reported, ok or not
  });

  it("rejects malformed and mis-checksummed addresses", async () => {
    expect((await call(scanPOST, { address: "0x123" })).status).toBe(400);
    const badCase =
      user.address.slice(0, 2) +
      user.address.slice(2).replace(/[a-f]/, (c) => c.toUpperCase());
    if (badCase !== user.address)
      expect((await call(scanPOST, { address: badCase })).status).toBe(400);
  });

  it("proves ownership with a real signature; the challenge is single-use", async () => {
    const ch = await (
      await call(challengePOST, { address: user.address })
    ).json();
    const signature = await user.signMessage({ message: ch.message });
    const first = await call(verifyPOST, {
      address: user.address,
      signature,
      challenge: ch.challenge,
    });
    expect(first.status).toBe(200);
    session = (await first.json()).token;
    const replay = await call(verifyPOST, {
      address: user.address,
      signature,
      challenge: ch.challenge,
    });
    expect(replay.status).toBe(409);
  });

  it("refuses a signature from someone else's key", async () => {
    const ch = await (
      await call(challengePOST, { address: user.address })
    ).json();
    const signature = await funder.signMessage({ message: ch.message });
    const res = await call(verifyPOST, {
      address: user.address,
      signature,
      challenge: ch.challenge,
    });
    expect(res.status).toBe(401);
  });

  it("won't build a transfer without a session for that exact address", async () => {
    const req = {
      owner: user.address,
      chainId: 1,
      asset: { kind: "native" },
      to: dest.address,
      amount: "max",
    };
    expect((await call(transferPOST, req)).status).toBe(401);
    const funderSession = await proveOwnership(funder);
    expect(
      (
        await call(transferPOST, req, {
          authorization: `Bearer ${funderSession}`,
        })
      ).status,
    ).toBe(403);
  });

  it("reports the exact gas shortfall for the stuck token", async () => {
    const { status, body } = await plan(session, {
      owner: user.address,
      chainId: 1,
      asset: { kind: "token", address: token },
      to: dest.address,
      amount: "max",
    });
    expect(status).toBe(200);
    expect(body.amount).toMatchObject({ raw: "250000000", symbol: "TUSD" });
    expect(body.shortfall).not.toBeNull();
    expect(body.shortfall.raw).toBe(body.fee.raw); // balance is 0, so it needs the whole fee
  });

  it("after topping up gas, the plan is sendable, faithful, and actually moves the tokens", async () => {
    const before = await plan(session, {
      owner: user.address,
      chainId: 1,
      asset: { kind: "token", address: token },
      to: dest.address,
      amount: "max",
    });
    await pub.waitForTransactionReceipt({
      hash: await wallet(funder).sendTransaction({
        to: user.address,
        value: BigInt(before.body.shortfall.raw),
      }),
    });

    const { body } = await plan(session, {
      owner: user.address,
      chainId: 1,
      asset: { kind: "token", address: token },
      to: dest.address,
      amount: "max",
    });
    expect(body.shortfall).toBeNull();
    tokenPlan = body;
    expect(
      planMismatch(tokenPlan, {
        owner: user.address,
        chainId: 1,
        asset: { kind: "token", address: token },
        destination: dest.address,
        requested: "max",
      }),
    ).toBeNull();

    const receipt = await sendPlan(user, tokenPlan);
    expect(receipt.status).toBe("success");
    expect(
      await pub.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [dest.address],
      }),
    ).toBe(250_000_000n);
  });

  it("'max' native send leaves only dust and never over-spends", async () => {
    await server.provider.request({
      method: "evm_setAccountBalance",
      params: [user.address, "0xDE0B6B3A7640000"],
    }); // 1 ETH
    const { body } = await plan(session, {
      owner: user.address,
      chainId: 1,
      asset: { kind: "native" },
      to: dest.address,
      amount: "max",
    });
    expect(body.shortfall).toBeNull();
    expect((await sendPlan(user, body)).status).toBe("success");
    const left = await pub.getBalance({ address: user.address });
    expect(left).toBeLessThan(10n ** 15n);
  });

  it("refuses destinations that would lose funds", async () => {
    const base = {
      owner: user.address,
      chainId: 1,
      asset: { kind: "token", address: token },
      amount: "1",
    };
    for (const to of [
      "0x0000000000000000000000000000000000000000",
      token,
      user.address,
    ]) {
      const { status, body } = await plan(session, { ...base, to });
      expect(status, to).toBe(400);
      expect(body.error).toBeTruthy();
    }
  });
});
