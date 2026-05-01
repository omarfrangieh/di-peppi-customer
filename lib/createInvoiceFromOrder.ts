/**
 * createInvoiceFromOrder
 *
 * Auto-generates a finalized invoice (status: "issued") when an online B2C order
 * is delivered.
 *
 * Trigger condition: order.source === "b2c"
 *   - Online platform orders have source: "b2c" set at checkout.
 *   - Admin-created orders (even for B2C customers) do NOT have this flag,
 *     so they go through the normal manual invoice creation flow like B2B.
 *
 * Idempotent: if an invoice already exists for this order (any status), it returns
 * the existing invoiceId without creating a duplicate.
 */

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  runTransaction,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createPurchaseOrdersForInvoice } from "@/lib/createPurchaseOrders";

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns the invoiceId (new or existing).
 * Throws if this order is not an online B2C order.
 */
export async function createInvoiceFromOrder(order: any): Promise<string> {
  if (!order?.id) throw new Error("createInvoiceFromOrder: missing order ID");

  // Only auto-generate for orders placed through the online customer platform
  if (order.source !== "b2c") {
    throw new Error(
      `createInvoiceFromOrder: order ${order.id} is not an online order (source="${order.source}"). ` +
        "Admin-created orders are invoiced manually."
    );
  }

  // ── Idempotency: return existing invoice if one already exists ──────────────
  // Check order.invoiceId first (fastest)
  if (order.invoiceId) return order.invoiceId;

  // Then query Firestore (handles the case where invoiceId wasn't written back yet)
  const existingSnap = await getDocs(
    query(collection(db, "invoices"), where("orderId", "==", order.id))
  );
  if (!existingSnap.empty) {
    const existingId = existingSnap.docs[0].id;
    // Backfill invoiceId on the order if missing
    await updateDoc(doc(db, "orders", order.id), { invoiceId: existingId }).catch(() => {});
    return existingId;
  }

  // ── Invoice number (atomic counter) ─────────────────────────────────────────
  const counterRef = doc(db, "settings", "invoiceCounter");
  let invoiceNumber = "";
  await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;
    const next = current + 1;
    invoiceNumber = `INV-${new Date().getFullYear()}-${String(next).padStart(3, "0")}`;
    tx.set(counterRef, { count: next }, { merge: true });
  });

  // ── Fetch order items ────────────────────────────────────────────────────────
  const itemsSnap = await getDocs(
    query(collection(db, "orderItems"), where("orderId", "==", order.id))
  );
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (items.length === 0) throw new Error(`createInvoiceFromOrder: no items found for order ${order.id}`);

  // ── Fetch product VAT rates ──────────────────────────────────────────────────
  const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))];
  const productNames: Record<string, string> = {};
  const productVatRates: Record<string, number> = {};
  await Promise.all(
    productIds.map(async (pid: any) => {
      const snap = await getDoc(doc(db, "products", pid));
      if (snap.exists()) {
        productNames[pid] = snap.data().name || pid;
        productVatRates[pid] = snap.data().vatRate ?? 0;
      }
    })
  );

  // ── Calculate totals ─────────────────────────────────────────────────────────
  // Customer checkout writes: priceAtTime, lineTotal (not unitPrice/totalPrice)
  // Admin order builder writes: unitPrice, totalPrice
  // Support both field naming conventions.
  const lineAmount = (item: any) =>
    Number(item.lineTotal || item.totalPrice || (item.priceAtTime ?? item.unitPrice ?? 0) * Number(item.quantity || 1));

  let taxAmount = 0;
  items.forEach((item: any) => {
    const vatRate = productVatRates[item.productId] || 0;
    if (vatRate > 0) {
      taxAmount += Math.round(lineAmount(item) * vatRate / 100 * 100) / 100;
    }
  });

  // order.total is set by customer checkout; order.netTotal by admin builder
  const subtotalNet = Number(order.netTotal || order.subtotal || order.total || order.totalPrice || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const finalTotal = subtotalNet + taxAmount + deliveryFee;

  // ── Create invoice ───────────────────────────────────────────────────────────
  const invoiceRef = await addDoc(collection(db, "invoices"), {
    invoiceNumber,
    orderId:         order.id,
    sourceOrderName: order.name || "",
    customerId:      order.customerId || "",
    customerName:    order.customerName || "",
    customerType:    order.customerType || "B2C",
    customerPhone:   order.customerPhone || order.deliveryPhone || "",
    customerBuilding: order.customerBuilding || "",
    customerApartment: order.customerApartment || "",
    customerFloor:   order.customerFloor || "",
    customerCity:    order.customerCity || order.deliveryCity || "",
    customerCountry: order.customerCountry || "",
    customerAdditionalInstructions: order.customerAdditionalInstructions || "",
    customerMapsLink: order.customerMapsLink || "",

    // Status: "issued" — fully finalized, no manual action required
    status:          "issued",

    invoiceDate:     todayISODate(),
    dueDate:         todayISODate(), // online orders are pay-on-delivery by default

    subtotalGross:   Number(order.grossTotal || order.totalPrice || order.total || 0),
    itemDiscountTotal: Number(order.itemDiscountTotal || 0),
    orderDiscountPercent: Number(order.discountPercent || 0),
    orderDiscountAmount: Number(order.discountAmount || 0),
    subtotalNet,
    deliveryFee,
    taxAmount,
    finalTotal:      Number(order.finalTotal || finalTotal),
    roundingAdjustment: 0,
    includeDelivery: true,

    currency:        "USD",
    notes:           order.notes || "",

    // Traceability markers
    source:          "b2c",
    autoGenerated:   true,

    canceledAt:      "",
    canceledBy:      "",
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp(),
    createdFromOrderAt: serverTimestamp(),
  });

  const invoiceId = invoiceRef.id;

  // ── Create invoice lines ─────────────────────────────────────────────────────
  await Promise.all(
    items.map((item: any) => {
      // Normalise field names: customer checkout uses priceAtTime/lineTotal,
      // admin order builder uses unitPrice/totalPrice. Support both.
      const unitPrice  = Number(item.unitPrice  ?? item.priceAtTime ?? 0);
      const lineTotal  = lineAmount(item);

      return addDoc(collection(db, "invoiceLines"), {
        invoiceId,
        orderId:            order.id,
        orderItemId:        item.id,
        productId:          item.productId || "",
        productName:        productNames[item.productId] || item.productName || item.name || "",
        quantity:           Number(item.quantity || 0),
        unitPrice,
        unitCostPrice:      Number(item.unitCostPrice || 0),
        itemDiscountPercent: Number(item.itemDiscountPercent || 0),
        itemDiscountAmount: Number(item.itemDiscountAmount || 0),
        lineGross:          lineTotal,
        lineNet:            lineTotal,
        profit:             Number(item.profit || 0),
        totalCostPrice:     Number(item.totalCostPrice || 0),
        vatRate:            productVatRates[item.productId] ?? null,
        notes:              item.notes || "",
        preparation:        item.preparation || "",
        sample:             Boolean(item.sample),
        gift:               Boolean(item.gift),
        createdAt:          serverTimestamp(),
        updatedAt:          serverTimestamp(),
      });
    })
  );

  // ── Create purchase orders (grouped by supplier) ────────────────────────────
  try {
    await createPurchaseOrdersForInvoice({
      orderId:     order.id,
      invoiceId,
      deliveryDate: order.deliveryDate || "",
      orderItems:  items.map((i: any) => ({
        ...i,
        productName: productNames[i.productId] || i.productName || "",
      })),
    });
  } catch (e) {
    console.error("createInvoiceFromOrder: PO creation failed (non-blocking)", e);
  }

  // ── Write invoiceId back onto the order ─────────────────────────────────────
  try {
    await updateDoc(doc(db, "orders", order.id), { invoiceId });
  } catch (e) {
    console.error("createInvoiceFromOrder: failed to write invoiceId back to order (non-blocking)", e);
  }

  return invoiceId;
}

/**
 * Safe wrapper — call this from advanceStatus().
 * Returns invoiceId on success, null on failure (never throws).
 */
export async function tryCreateInvoiceFromOrder(order: any): Promise<string | null> {
  if (order?.source !== "b2c") return null; // not an online order — skip silently
  try {
    return await createInvoiceFromOrder(order);
  } catch (e) {
    console.error("tryCreateInvoiceFromOrder failed:", e);
    return null;
  }
}
