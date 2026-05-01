/**
 * fifoDeduction.ts
 *
 * FIFO stock deduction utilities.
 *
 * Trigger: when an order's status advances to "To Deliver".
 *   - deductStockForOrder(orderId) → creates "Out" movements, depletes oldest batches first,
 *     recalculates products.currentStock, marks order.stockDeducted = true.
 *
 * Undo:  when an order is moved back from "To Deliver" to "Preparing".
 *   - restoreStockForOrder(orderId) → creates reversal "In" movements,
 *     recalculates products.currentStock, marks order.stockDeducted = false.
 *
 * Both functions are idempotent:
 *   - deductStockForOrder does nothing if order.stockDeducted === true.
 *   - restoreStockForOrder does nothing if order.stockDeducted !== true.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── types ───────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  orderId: string;
}

interface StockMovement {
  id: string;
  productId: string;
  movementType: "In" | "Out";
  quantity: number;
  remainingQty: number;
  batchDate: string;     // YYYY-MM-DD, used for FIFO ordering
  expiryDate?: string | null;
  source?: string;
  orderId?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const snap = await getDocs(
    query(collection(db, "orderItems"), where("orderId", "==", orderId))
  );
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<OrderItem, "id">) }));
}

async function getOrderData(orderId: string): Promise<Record<string, any> | null> {
  const snap = await getDocs(
    query(collection(db, "orders"), where("__name__", "==", orderId))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

/** Recalculate currentStock for a product from all its movements. */
async function recalcStock(productId: string): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "stockMovements"), where("productId", "==", productId))
  );
  let total = 0;
  snap.forEach(d => {
    const m = d.data();
    total += m.movementType === "In" ? Number(m.quantity) : -Number(m.quantity);
  });
  return Math.max(0, total);
}

// ─── deduct ──────────────────────────────────────────────────────────────────

/**
 * Deduct stock FIFO for all items in an order.
 * Safe to call multiple times — skipped if already deducted.
 */
export async function deductStockForOrder(orderId: string): Promise<void> {
  const orderSnap = await getDocs(
    query(collection(db, "orders"), where("__name__", "==", orderId))
  );
  if (orderSnap.empty) return;
  const orderData = orderSnap.docs[0].data();

  // Idempotency check
  if (orderData.stockDeducted === true) return;

  const items = await getOrderItems(orderId);
  if (items.length === 0) return;

  // Group items by productId (consolidate duplicate products in one order)
  const qtyByProduct: Record<string, number> = {};
  for (const item of items) {
    qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + Number(item.quantity);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [productId, totalQty] of Object.entries(qtyByProduct)) {
    if (totalQty <= 0) continue;

    await runTransaction(db, async (tx) => {
      // Fetch all "In" movements with remaining stock, oldest first
      const movSnap = await getDocs(
        query(
          collection(db, "stockMovements"),
          where("productId", "==", productId),
          where("movementType", "==", "In")
        )
      );
      const batches: StockMovement[] = movSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<StockMovement, "id">) }))
        .filter(m => (m.remainingQty ?? m.quantity) > 0)
        .sort((a, b) => (a.batchDate || "").localeCompare(b.batchDate || ""));

      let remaining = totalQty;

      for (const batch of batches) {
        if (remaining <= 0) break;
        const available = batch.remainingQty ?? batch.quantity;
        const consume   = Math.min(available, remaining);

        // Update remainingQty on the batch movement
        tx.update(doc(db, "stockMovements", batch.id), {
          remainingQty: available - consume,
        });
        remaining -= consume;
      }

      // Create an "Out" movement for this order
      const outRef = doc(collection(db, "stockMovements"));
      tx.set(outRef, {
        productId,
        movementType: "Out",
        quantity: totalQty,
        remainingQty: 0,
        source: "order",
        orderId,
        notes: `Order ${orderId} dispatched (FIFO)`,
        batchDate: today,
        movementDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });

    // Recalculate and persist currentStock
    const newStock = await recalcStock(productId);
    await runTransaction(db, async (tx) => {
      tx.update(doc(db, "products", productId), { currentStock: newStock });
    });
  }

  // Mark order as deducted
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, "orders", orderId), {
      stockDeducted: true,
      stockDeductedAt: serverTimestamp(),
    });
  });
}

// ─── restore ─────────────────────────────────────────────────────────────────

/**
 * Reverse the FIFO deduction for an order (undo "To Deliver" → back to Preparing).
 * Creates reversal "In" movements; safe to call multiple times.
 */
export async function restoreStockForOrder(orderId: string): Promise<void> {
  const orderSnap = await getDocs(
    query(collection(db, "orders"), where("__name__", "==", orderId))
  );
  if (orderSnap.empty) return;
  const orderData = orderSnap.docs[0].data();

  // Only restore if deduction was actually done
  if (orderData.stockDeducted !== true) return;

  const items = await getOrderItems(orderId);
  if (items.length === 0) return;

  const qtyByProduct: Record<string, number> = {};
  for (const item of items) {
    qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + Number(item.quantity);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [productId, totalQty] of Object.entries(qtyByProduct)) {
    if (totalQty <= 0) continue;

    await runTransaction(db, async (tx) => {
      // Find the "Out" movements created for this order
      const movSnap = await getDocs(
        query(
          collection(db, "stockMovements"),
          where("productId", "==", productId),
          where("movementType", "==", "Out"),
          where("orderId", "==", orderId)
        )
      );
      // Delete the order's Out movements
      movSnap.docs.forEach(d => tx.delete(doc(db, "stockMovements", d.id)));

      // Restore the "In" batch remainingQty values by adding back
      // Simplest safe approach: create a reversal "In" movement
      const inRef = doc(collection(db, "stockMovements"));
      tx.set(inRef, {
        productId,
        movementType: "In",
        quantity: totalQty,
        remainingQty: totalQty,
        source: "order-undo",
        orderId,
        notes: `Order ${orderId} returned to Preparing (FIFO reversal)`,
        batchDate: today,
        movementDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    });

    // Recalculate and persist currentStock
    const newStock = await recalcStock(productId);
    await runTransaction(db, async (tx) => {
      tx.update(doc(db, "products", productId), { currentStock: newStock });
    });
  }

  // Mark order deduction as reversed
  await runTransaction(db, async (tx) => {
    tx.update(doc(db, "orders", orderId), {
      stockDeducted: false,
      stockDeductedAt: null,
    });
  });
}
