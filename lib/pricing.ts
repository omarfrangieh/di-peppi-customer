export type CustomerType = "B2B" | "B2C" | "Owner" | string;

export interface ProductForPricing {
  id: string;
  name: string;
  costPrice?: number;
  b2bPrice?: number;
  b2cPrice?: number;
}

export interface CustomerForPricing {
  id: string;
  name: string;
  customerType?: CustomerType;
  clientMargin?: number; // can be 20 or 0.2
  deliveryFee?: number;
  specialPrices?: Record<string, number>;
}

export interface PricingInput {
  product: ProductForPricing | null;
  customer: CustomerForPricing | null;
  quantity?: number;
  isSample?: boolean;
  isGift?: boolean;
  ownerAtCost?: boolean;
}

export interface PricingResult {
  unitCost: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  source:
    | "empty"
    | "sample-free"
    | "gift-free"
    | "owner-cost"
    | "special-price"
    | "margin-price"
    | "b2b-price"
    | "b2c-price"
    | "fallback-cost";
  label: string;
  debug: string;
  marginPercent: number;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function normalizeMarginPercent(raw: unknown): number {
  const value = safeNumber(raw);

  if (value <= 0) return 0;

  // supports both 20 and 0.2
  if (value > 0 && value < 1) {
    return value * 100;
  }

  return value;
}

function calculateMarginBasedPrice(cost: number, marginPercent: number): number {
  if (cost <= 0 || marginPercent <= 0 || marginPercent >= 100) {
    return cost;
  }

  return cost / (1 - marginPercent / 100);
}

function getSpecialPrice(
  customer: CustomerForPricing | null,
  productId?: string
): number | null {
  if (!customer || !productId) return null;

  const raw = customer.specialPrices?.[productId];
  if (raw === undefined || raw === null || raw === "") return null;

  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export function getPricing(input: PricingInput): PricingResult {
  const product = input.product;
  const customer = input.customer;
  const quantity = Math.max(0, safeNumber(input.quantity));

  if (!product) {
    return {
      unitCost: 0,
      unitPrice: 0,
      quantity,
      lineTotal: 0,
      source: "empty",
      label: "No product selected",
      debug: "Missing product",
      marginPercent: 0,
    };
  }

  const cost = safeNumber(product.costPrice);
  const b2b = safeNumber(product.b2bPrice);
  const b2c = safeNumber(product.b2cPrice);
  const customerType = String(customer?.customerType || "B2C").toUpperCase();
  const marginPercent = normalizeMarginPercent(customer?.clientMargin);
  const specialPrice = getSpecialPrice(customer, product.id);

  let unitPrice = 0;
  let source: PricingResult["source"] = "fallback-cost";
  let label = "Cost Price";
  let debug = "Fallback to cost";

  if (input.isSample) {
    unitPrice = 0;
    source = "sample-free";
    label = "Sample";
    debug = "Sample order = free";
  } else if (input.isGift) {
    unitPrice = 0;
    source = "gift-free";
    label = "Gift";
    debug = "Gift order = free";
  } else if (customerType === "OWNER" && input.ownerAtCost !== false) {
    unitPrice = cost;
    source = "owner-cost";
    label = "Owner Cost";
    debug = "Owner customer uses cost price";
  } else if (specialPrice !== null) {
    unitPrice = specialPrice;
    source = "special-price";
    label = "Special Client Price";
    debug = "Customer has a specific price for this product";
  } else if (marginPercent > 0 && cost > 0) {
    unitPrice = calculateMarginBasedPrice(cost, marginPercent);
    source = "margin-price";
    label = `Margin Price (${marginPercent}%)`;
    debug = "Calculated from cost and client margin";
  } else if (customerType === "B2B") {
    unitPrice = b2b || cost;
    source = "b2b-price";
    label = "B2B Price";
    debug = "Using product B2B price";
  } else {
    unitPrice = b2c || b2b || cost;
    source = "b2c-price";
    label = "B2C Price";
    debug = "Using product B2C price";
  }

  unitPrice = roundMoney(unitPrice);
  const lineTotal = roundMoney(unitPrice * quantity);

  return {
    unitCost: roundMoney(cost),
    unitPrice,
    quantity,
    lineTotal,
    source,
    label,
    debug,
    marginPercent,
  };
}
