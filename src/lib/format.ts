export function fmtFiat(n: number | string, currency = "USD") {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(v || 0);
}
export function fmtCrypto(n: number | string, asset = "USDT") {
  const v = typeof n === "string" ? Number(n) : n;
  const d = asset === "BTC" ? 8 : 4;
  return `${v.toFixed(d)} ${asset}`;
}
export function shortId(id: string) { return id.slice(0, 8); }
