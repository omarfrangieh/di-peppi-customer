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
  increment,
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

  // ── Fetch product details (VAT rates + b2cPrice fallback + requiresWeighing) ─
  const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))];
  const productNames: Record<string, string> = {};
  const productVatRates: Record<string, number> = {};
  const productB2cPrices: Record<string, number> = {};
  const productRequiresWeighing: Record<string, boolean> = {};
  await Promise.all(
    productIds.map(async (pid: any) => {
      const snap = await getDoc(doc(db, "products", pid));
      if (snap.exists()) {
        productNames[pid] = snap.data().name || pid;
        productVatRates[pid] = snap.data().vatRate ?? 0;
        productB2cPrices[pid] = Number(snap.data().b2cPrice || 0);
        productRequiresWeighing[pid] = Boolean(snap.data().requiresWeighing);
      }
    })
  );

  // ── Block if any items require weighing but haven't been confirmed ───────────
  // Check BOTH the orderItem flag AND the product flag — B2C checkout does not
  // copy requiresWeighing onto orderItems, so we must look it up from the product.
  const unconfirmedWeighItems = items.filter((i: any) => {
    const requiresWeighing = i.requiresWeighing === true || productRequiresWeighing[i.productId] === true;
    return requiresWeighing && i.weighConfirmed !== true;
  });
  if (unconfirmedWeighItems.length > 0) {
    const names = unconfirmedWeighItems
      .map((i: any) => productNames[i.productId] || i.productName || i.productId)
      .join(", ");
    throw new Error(
      `Cannot generate invoice: the following items require weighing confirmation before invoicing — ${names}. ` +
      "Please confirm the final weight in the order details first."
    );
  }

  // ── Calculate totals ─────────────────────────────────────────────────────────
  // Customer checkout writes: priceAtTime, lineTotal (not unitPrice/totalPrice)
  // Admin order builder writes: unitPrice, totalPrice
  // Support both field naming conventions.
  // If stored price is 0 (product had no b2cPrice at checkout time), fall back
  // to the product's current b2cPrice so the invoice is never $0.
  const resolvedUnitPrice = (item: any): number => {
    const stored = Number(item.priceAtTime ?? item.unitPrice ?? 0);
    if (stored > 0) return stored;
    return productB2cPrices[item.productId] || 0;
  };
  const lineAmount = (item: any) => {
    // For items requiring weighing, use confirmedWeight as the quantity
    // so the invoice always reflects the final measured amount, not the estimated qty.
    // Check both the orderItem flag and the product flag (B2C checkout doesn't copy requiresWeighing to orderItems).
    const itemRequiresWeighing = item.requiresWeighing === true || productRequiresWeighing[item.productId] === true;
    const weighConfirmed = itemRequiresWeighing && item.weighConfirmed && item.confirmedWeight;
    // confirmedWeight is stored in grams; divide by 1000 to get kg for price calculation (unitPrice is per kg)
    const qty = weighConfirmed
      ? Number(item.confirmedWeight) / 1000
      : Number(item.quantity || 1);
    const stored = Number(item.lineTotal || item.totalPrice || 0);
    // If weighing was confirmed, recalculate line amount from confirmed weight
    if (weighConfirmed) {
      return resolvedUnitPrice(item) * qty;
    }
    if (stored > 0) return stored;
    return resolvedUnitPrice(item) * qty;
  };

  let taxAmount = 0;
  items.forEach((item: any) => {
    const vatRate = productVatRates[item.productId] || 0;
    if (vatRate > 0) {
      taxAmount += Math.round(lineAmount(item) * vatRate / 100 * 100) / 100;
    }
  });

  // Compute subtotalNet from actual item line amounts (not order document fields).
  // This ensures weigh-required items use the confirmed weight, not the estimated qty
  // from when the order was first placed.
  const subtotalNet = Math.round(
    items.reduce((sum: number, item: any) => sum + lineAmount(item), 0) * 100
  ) / 100;
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

    subtotalGross:   subtotalNet, // computed from actual item line amounts
    itemDiscountTotal: Number(order.itemDiscountTotal || 0),
    orderDiscountPercent: Number(order.discountPercent || 0),
    orderDiscountAmount: Number(order.discountAmount || 0),
    subtotalNet,
    deliveryFee,
    taxAmount,
    finalTotal,    // always use locally computed total (reflects confirmed weights)
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

  // ── Create invoice lines + patch orderItems with correct prices ──────────────
  await Promise.all(
    items.map(async (item: any) => {
      // Normalise field names: customer checkout uses priceAtTime/lineTotal,
      // admin order builder uses unitPrice/totalPrice. Support both.
      // Use resolvedUnitPrice() which falls back to current product b2cPrice if stored price is 0.
      const unitPrice  = resolvedUnitPrice(item);
      const lineTotal  = lineAmount(item);
      const qty        = Number(item.quantity || 0);

      await addDoc(collection(db, "invoiceLines"), {
        invoiceId,
        orderId:            order.id,
        orderItemId:        item.id,
        productId:          item.productId || "",
        productName:        productNames[item.productId] || item.productName || item.name || "",
        quantity:           qty,
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

      // Patch the orderItem in Firestore so the admin order detail page shows
      // correct prices (the Cloud Function reads unitPrice/priceAtTime directly).
      if (unitPrice > 0 && Number(item.unitPrice || item.priceAtTime || 0) === 0) {
        try {
          await updateDoc(doc(db, "orderItems", item.id), {
            unitPrice,
            priceAtTime: unitPrice,
            lineTotal,
            totalPrice:  lineTotal,
          });
        } catch (e) {
          console.error("createInvoiceFromOrder: orderItem price patch failed (non-blocking)", e);
        }
      }
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

  // ── Write invoiceId + correct totals back onto the order ────────────────────
  // This ensures the order document reflects the real invoice amount,
  // fixing revenue KPIs and kanban totals which read from the order.
  try {
    // Always write the computed finalTotal back to the order so it reflects
    // confirmed weights (not the estimated amount from checkout).
    await updateDoc(doc(db, "orders", order.id), {
      invoiceId,
      invoiceStatus: "issued",
      ...(finalTotal > 0 ? { total: finalTotal, finalTotal } : {}),
    });
  } catch (e) {
    console.error("createInvoiceFromOrder: failed to write invoiceId back to order (non-blocking)", e);
  }

  // ── Auto-deduct from wallet (always, for all B2C online orders) ─────────────
  // If the customer has a wallet balance, apply it immediately on delivery.
  // This covers wallet payment orders AND covers partial credit for any order.
  try {
    if (order.customerId) {
      const custSnap = await getDoc(doc(db, "customers", order.customerId));
      if (custSnap.exists()) {
        const walletBalance = Number(custSnap.data().walletBalance || 0);
        // Use the locally-computed finalTotal (reflects confirmed weights, not estimated checkout total)
        const invoiceTotal  = finalTotal > 0 ? finalTotal : Number(order.finalTotal || order.total || 0);

        if (walletBalance > 0 && invoiceTotal > 0) {
          const applyAmount  = Math.round(Math.min(walletBalance, invoiceTotal) * 100) / 100;
          const newBalance   = Math.round((invoiceTotal - applyAmount) * 100) / 100;
          const invoiceStatus = newBalance <= 0 ? "paid" : "partly paid";

          // Record the payment
          await addDoc(collection(db, "payments"), {
            invoiceId,
            invoiceNumber,
            customerId:  order.customerId,
            paymentDate: todayISODate(),
            amount:      applyAmount,
            method:      "Wallet",
            notes:       "Auto-applied from customer wallet on delivery",
            currency:    "USD",
            createdAt:   serverTimestamp(),
          });

          // Update invoice paid status
          await updateDoc(doc(db, "invoices", invoiceId), {
            paidAmount: applyAmount,
            status:     invoiceStatus,
            updatedAt:  serverTimestamp(),
          });

          // Sync invoiceStatus back to the order so the order card reflects payment
          await updateDoc(doc(db, "orders", order.id), {
            invoiceStatus,
          });

          // Deduct from customer wallet
          await updateDoc(doc(db, "customers", order.customerId), {
            walletBalance: increment(-applyAmount),
          });

          // Wallet transaction log
          await addDoc(collection(db, "walletTransactions"), {
            customerId:    order.customerId,
            customerName:  order.customerName || "",
            invoiceId,
            invoiceNumber,
            orderId:       order.id,
            orderName:     order.name || "",
            amount:        applyAmount,
            type:          "debit",
            description:   `Auto-applied to ${invoiceNumber} on delivery`,
            createdAt:     serverTimestamp(),
          });
        }
      }
    }
  } catch (e) {
    console.error("createInvoiceFromOrder: wallet deduction failed (non-blocking)", e);
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
    const invoiceId = await createInvoiceFromOrder(order);

    // If the order total is wrong (e.g. was saved as $0 at checkout), patch it
    // by reading the finalized invoice total and writing it back to the order.
    if (invoiceId && Number(order.total || order.finalTotal || 0) === 0) {
      try {
        const invSnap = await getDoc(doc(db, "invoices", invoiceId));
        if (invSnap.exists()) {
          const invTotal = Number(invSnap.data().finalTotal || 0);
          if (invTotal > 0) {
            await updateDoc(doc(db, "orders", order.id), {
              total: invTotal,
              finalTotal: invTotal,
            });
          }
        }
      } catch (e) {
        console.error("tryCreateInvoiceFromOrder: order total patch failed (non-blocking)", e);
      }
    }

    return invoiceId;
  } catch (e) {
    console.error("tryCreateInvoiceFromOrder failed:", e);
    return null;
  }
}
