// Heuristic spam detection for ERC-20 tokens.
//
// Addresses that have ever touched a popular chain collect unsolicited "airdrop"
// tokens whose name or symbol is an advert — usually a phishing URL telling the
// holder to "claim" something. Alchemy's Token API doesn't flag these for
// ERC-20s, so we check the token's own metadata. We flag rather than drop: the
// UI hides flagged tokens by default and never offers to move them, because
// interacting with a spam token's contract is itself a common phishing lure.

const URL_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\bt\.me\b/i,
  // A dotted name ending in a TLD scammers favour, e.g. "usdt-reward.com".
  // ".finance"/".fi" are deliberately absent: real tokens use them as names
  // (YFI's name is "yearn.finance").
  /[a-z0-9-]\.(com|net|org|io|xyz|app|site|top|vip|cc|me|info|pro|club|live|link|online|gift|cash|tech|world|today|claims?)\b/i,
];

// Words that only show up in adverts. Kept narrow on purpose: broader words
// ("win", "access", "gift") are real tickers or project names.
const LURE_WORDS =
  /\b(claim|claims|reward|rewards|airdrop|visit|voucher|bonus|giveaway|redeem|eligible|activate)\b/i;

// Emoji, pictographs and other symbols scammers use to grab attention.
const ATTENTION_CHARS =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

export type SpamCheck = { spam: boolean; reason?: string };

export function checkTokenSpam(meta: {
  symbol?: string | null;
  name?: string | null;
}): SpamCheck {
  const symbol = (meta.symbol ?? "").trim();
  const name = (meta.name ?? "").trim();
  const text = `${symbol} ${name}`;

  if (URL_PATTERNS.some((re) => re.test(text))) {
    return { spam: true, reason: "name contains a link" };
  }
  if (LURE_WORDS.test(text)) {
    return {
      spam: true,
      reason: "name is an advert (claim / reward / airdrop)",
    };
  }
  if (ATTENTION_CHARS.test(text)) {
    return { spam: true, reason: "name contains emoji or symbols" };
  }
  // Real tickers have no spaces; a "symbol" that is a sentence is an advert.
  // (No length rule: Aave debt tokens have symbols like "variableDebtEthUSDC".)
  if (/\s/.test(symbol) && symbol.length > 8) {
    return { spam: true, reason: "symbol is not a ticker" };
  }
  return { spam: false };
}
