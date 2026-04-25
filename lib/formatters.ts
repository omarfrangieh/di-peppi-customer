export function formatQty(num: number | string | null | undefined): string {
  const val = Number(num || 0);
  return val.toFixed(3).replace(/\.?0+$/, "");
}

export function formatPrice(num: number | string | null | undefined): string {
  return Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
