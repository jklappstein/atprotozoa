// coins.js — the tag economy. Pure functions + a tiny localStorage wallet.
// Posting and replying are free; every @mention costs one coin.

// A coin trickles in every REFILL_MS up to MAX_COINS. Both numbers are product
// decisions for the game's pacing, not safety limits.
export const START_COINS = 5;
export const MAX_COINS = 10;
export const REFILL_MS = 20 * 60 * 1000;

const MENTION_RE = /(^|[\s(])@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)/g;

// Every mention occurrence in the text, with UTF-8 byte offsets for facets.
export function findMentions(text) {
  const enc = new TextEncoder();
  const out = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const startChar = m.index + m[1].length;
    const start = enc.encode(text.slice(0, startChar)).length;
    const end = start + enc.encode("@" + m[2]).length;
    out.push({ handle: m[2].toLowerCase(), start, end });
  }
  return out;
}

export const tagCost = (text) => findMentions(text).length;

// wallet = { coins, at } where `at` is when `coins` was last settled.
export function settle(wallet, now = Date.now()) {
  if (wallet.coins >= MAX_COINS) return { coins: wallet.coins, at: now };
  const gained = Math.floor((now - wallet.at) / REFILL_MS);
  if (gained <= 0) return wallet;
  const coins = Math.min(MAX_COINS, wallet.coins + gained);
  return { coins, at: coins >= MAX_COINS ? now : wallet.at + gained * REFILL_MS };
}

export const msToNextCoin = (wallet, now = Date.now()) =>
  wallet.coins >= MAX_COINS ? 0 : Math.max(0, wallet.at + REFILL_MS - now);

export function spend(wallet, n, now = Date.now()) {
  const w = settle(wallet, now);
  if (n > w.coins) return null;
  // spending from a full purse starts the refill clock now
  return { coins: w.coins - n, at: w.coins >= MAX_COINS ? now : w.at };
}

const KEY = "tagcoins.wallet.v1";
export function loadWallet(now = Date.now()) {
  try {
    const w = JSON.parse(localStorage.getItem(KEY));
    if (w && Number.isFinite(w.coins) && Number.isFinite(w.at)) return settle(w, now);
  } catch {}
  return { coins: START_COINS, at: now };
}
export function saveWallet(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch {}
}
