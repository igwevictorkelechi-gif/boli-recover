import { describe, expect, it } from "vitest";
import { checkTokenSpam } from "@/lib/spam";

describe("checkTokenSpam", () => {
  it.each([
    ["USDT", "Tether USD"],
    ["YFI", "yearn.finance"],
    ["WIN", "WINkLink"],
    ["ACS", "Access Protocol"],
    ["variableDebtEthUSDC", "Aave Ethereum Variable Debt USDC"],
    ["UNI-V2", "Uniswap V2"],
    ["Cake-LP", "Pancake LPs"],
    ["USDC.e", "Bridged USDC"],
  ])("keeps real token %s", (symbol, name) => {
    expect(checkTokenSpam({ symbol, name }).spam).toBe(false);
  });

  it.each([
    ["$ USDCBonus.com", "USDC Bonus"],
    ["Visit usdt-claim.org", "claim rewards"],
    ["ETHG", "ETH Gift: t.me/xyz"],
    ["🎁 AIRDROP", "Reward"],
    ["Claim USDT at https://x.io", "x"],
    ["X", "www.free-tokens.xyz"],
  ])("flags advert token %s", (symbol, name) => {
    const r = checkTokenSpam({ symbol, name });
    expect(r.spam).toBe(true);
    expect(r.reason).toBeTruthy();
  });
});
