import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createPurchaseOrdersForInvoice } from "@/lib/createPurchaseOrders";

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

export async function syncOrderToInvoice({
  orderId,
  invoiceId,
  order,
  customer,
}: {
  orderId: string;
  invoiceId: string;
  order: any;
  customer: any;
}) {
  const itemsSnap = await getDocs(
    query(collection(db, "orderItems"), where("orderId", "==", orderId))
  );
  const orderItems = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  if (orderItems.length === 0) throw new Error("No order items found");

  const productIds = [...new Set(orderItems.map((i: any) => i.productId).filter(Boolean))];
  const productNames: Record<string, string> = {};
  const productMap: Record<string, any> = {};
  await Promise.all(
    productIds.map(async (pid: any) => {
      const snap = await getDoc(doc(db, "products", pid));
      if (snap.exists()) {
        productNames[pid] = snap.data().name || pid;
        productMap[pid] = snap.data();
      }
    })
  );

  const existingLinesSnap = await getDocs(
    query(collection(db, "invoiceLines"), where("invoiceId", "==", invoiceId))
  );
  const batch = writeBatch(db);
  existingLinesSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  let subtotalGross = 0;
  let subtotalNet = 0;
  let itemDiscountTotal = 0;
  let taxAmount = 0;

  await Promise.all(
    orderItems.map(async (item: any) => {
      const isFree = item.sample || item.gift;
      const lineGross = isFree ? 0 : Number(item.grossLineTotal || item.totalPrice || 0);
      const lineNet = isFree ? 0 : Number(item.netLineTotal || item.totalPrice || 0);
      const profit = isFree ? -(Number(item.unitCostPrice || 0) * Number(item.quantity || 0)) : Number(item.profit || 0);
      const vatRate = productMap[item.productId]?.vatRate;

      subtotalGross += lineGross;
      subtotalNet += lineNet;
      itemDiscountTotal += Math.max(lineGross - lineNet, 0);

      if (!isFree && vatRate) {
        taxAmount += Math.round((lineNet * vatRate / 100) * 100) / 100;
      }

      await addDoc(collection(db, "invoiceLines"), {
        invoiceId,
        orderId,
        orderItemId: item.id,
        productId: item.productId || "",
        productName: productNames[item.productId] || item.productName || "",
        quantity: Number(item.quantity || 0),
        unitPrice: isFree ? 0 : Number(item.unitPrice || 0),
        unitCostPrice: Number(item.unitCostPrice || 0),
        itemDiscountPercent: isFree ? 0 : Number(item.itemDiscountPercent || 0),
        itemDiscountAmount: isFree ? 0 : Number(item.itemDiscountAmount || 0),
        lineGross,
        lineNet,
        profit,
        totalCostPrice: Number(item.unitCostPrice || 0) * Number(item.quantity || 0),
        vatRate,
        notes: item.notes || "",
        preparation: item.preparation || "",
        sample: Boolean(item.sample),
        gift: Boolean(item.gift),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    })
  );

  const deliveryFee = Number(order.deliveryFee || 0);
  const orderDiscountPercent = Number(order.discountPercent || 0);
  const orderDiscountAmount = Number(order.discountAmount || 0);
  const orderDiscountValue = orderDiscountPercent > 0
    ? subtotalNet * (orderDiscountPercent / 100)
    : orderDiscountAmount;

  const rawFinalTotal = Math.max(subtotalNet - orderDiscountValue + taxAmount + deliveryFee, 0);
  const finalTotal = customer?.customerType === "B2C" ? roundToHalf(rawFinalTotal) : rawFinalTotal;
  const roundingAdjustment = finalTotal - rawFinalTotal;

  await updateDoc(doc(db, "invoices", invoiceId), {
    subtotalGross,
    subtotalNet,
    itemDiscountTotal,
    orderDiscountPercent,
    orderDiscountAmount: orderDiscountValue,
    deliveryFee,
    taxAmount,
    finalTotal,
    roundingAdjustment,
    updatedAt: serverTimestamp(),
  });

  const existingPOsSnap = await getDocs(
    query(collection(db, "purchaseOrders"), where("orderId", "==", orderId))
  );
  const deletablePOs = existingPOsSnap.docs.filter(
    (d) => d.data().status === "Generated"
  );
  await Promise.all(deletablePOs.map((d) => deleteDoc(d.ref)));

  try {
    const itemsWithNames = orderItems.map((item: any) => ({
      ...item,
      productName: productNames[item.productId] || item.productName || "",
    }));
    await createPurchaseOrdersForInvoice({
      orderId,
      invoiceId,
      deliveryDate: order.deliveryDate || "",
      orderItems: itemsWithNames,
    });
  } catch (e) {
    console.error("PO recreation failed (non-blocking):", e);
  }

  return { finalTotal, subtotalNet, subtotalGross };
}
