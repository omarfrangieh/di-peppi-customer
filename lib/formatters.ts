// Converts ALL CAPS or mixed-case product names to Title Case for display.
// Preserves numbers, slashes, hyphens and short tokens like "13/16", "B2C", "120g".
const LOWERCASE_WORDS = new Set(["and", "or", "of", "in", "at", "the", "a", "an", "by", "for", "with", "de", "en", "du"]);
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (!word) return word;
      // Always capitalise first and last word; keep prepositions/articles lowercase
      if (i !== 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function formatQty(num: number | string | null | undefined): string {
  const val = Number(num || 0);
  return val.toFixed(3).replace(/\.?0+$/, "");
}

export function formatPrice(num: number | string | null | undefined): string {
  return Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
