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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createPurchaseOrdersForInvoice } from "@/lib/createPurchaseOrders";

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createDraftInvoice(order: any) {
  if (!order?.id) {
    throw new Error("Missing order ID");
  }

  // Prevent duplicate draft
  const existingQuery = query(
    collection(db, "invoices"),
    where("orderId", "==", order.id),
    where("status", "==", "draft")
  );

  const existingSnap = await getDocs(existingQuery);

  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  // Generate invoice number
  const counterRef = doc(db, 'settings', 'invoiceCounter');
  let invoiceNumber = '';
  await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const currentCount = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;
    const newCount = currentCount + 1;
    const year = new Date().getFullYear();
    invoiceNumber = `INV-${year}-${String(newCount).padStart(3, '0')}`;
    transaction.set(counterRef, { count: newCount }, { merge: true });
  });

  // Get order items
  const itemsQuery = query(
    collection(db, "orderItems"),
    where("orderId", "==", order.id)
  );

  const itemsSnap = await getDocs(itemsQuery);

const items = itemsSnap.docs.map((doc) => ({
  id: doc.id,
  ...doc.data(),
}));

// Fetch product names
  const productIds = [...new Set(items.map((i: any) => i.productId).filter(Boolean))];
  const productNames: Record<string, string> = {};
  await Promise.all(
    productIds.map(async (pid: any) => {
      const snap = await getDoc(doc(db, 'products', pid));
      if (snap.exists()) {
        productNames[pid] = snap.data().name || pid;
      }
    })
  );

  console.log('ORDER USED FOR INVOICE:', order);
console.log("FIRST ORDER ITEM USED FOR INVOICE:", items[0]);

if (items.length === 0) {
  throw new Error("No order items found");
}

// Create invoice
  const invoiceRef = await addDoc(collection(db, "invoices"), {
    invoiceNumber: invoiceNumber,
    orderId: order.id,
    customerId: order.customerId || "",
    status: "draft",
    invoiceDate: todayISODate(),
    dueDate: "",
    customerName: order.customerName || order.name || "",
    customerType: order.customerType || "",
    customerPhone: order.customerPhone || "",
    customerBuilding: order.customerBuilding || "",
    customerApartment: order.customerApartment || "",
    customerFloor: order.customerFloor || "",
    customerCity: order.customerCity || "",
    customerCountry: order.customerCountry || "",
    customerAdditionalInstructions: order.customerAdditionalInstructions || "",
    customerMapsLink: order.customerMapsLink || "",
    subtotalGross: Number(order.grossTotal || order.totalPrice || 0),
    itemDiscountTotal: Number(order.itemDiscountTotal || 0),
    orderDiscountPercent: Number(order.discountPercent || 0),
    orderDiscountAmount: Number(order.discountAmount || 0),
    subtotalNet: Number(order.netTotal || order.totalPrice || 0),
    deliveryFee: Number(order.deliveryFee || 0),
    finalTotal: order.customerType === "B2C" ? Math.round(Number(order.rawFinalTotal || order.finalTotal || 0) * 2) / 2 : Number(order.finalTotal || 0),
    roundingAdjustment: order.customerType === "B2C" ? (Math.round(Number(order.rawFinalTotal || order.finalTotal || 0) * 2) / 2) - Number(order.rawFinalTotal || order.finalTotal || 0) : 0,
    taxRate: 0,
    taxAmount: 0,
    includeDelivery: true,
    canceledAt: "",
    canceledBy: "",
    currency: "USD",
    notes: order.notes || "",
    sourceOrderName: order.name || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdFromOrderAt: serverTimestamp(),
  });

  const invoiceId = invoiceRef.id;

// Create invoice lines
  await Promise.all(
    items.map((item: any) =>
      addDoc(collection(db, "invoiceLines"), {
        invoiceId,
        orderId: order.id,
        orderItemId: item.id,
        productId: item.productId || "",
        productName: productNames[item.productId] || item.productName || item.name || "",
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        unitCostPrice: Number(item.unitCostPrice || 0),
        itemDiscountPercent: Number(item.itemDiscountPercent || 0),
        itemDiscountAmount: Number(item.itemDiscountAmount || 0),
        lineGross: Number(item.totalPrice || 0),      // ✅ was item.lineGross
        lineNet: Number(item.totalPrice || 0),         // ✅ was item.lineNet
        profit: Number(item.profit || 0),              // ✅ new field
        totalCostPrice: Number(item.totalCostPrice || 0), // ✅ new field
        notes: item.notes || "",
        preparation: item.preparation || "",
        sample: Boolean(item.sample),
        gift: Boolean(item.gift),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  );

  // Create Purchase Orders grouped by supplier
  try {
    const itemsWithNames = items.map((item: any) => ({
      ...item,
      productName: productNames[item.productId] || item.productName || "",
    }));
    await createPurchaseOrdersForInvoice({
      orderId: order.id,
      invoiceId,
      deliveryDate: order.deliveryDate || "",
      orderItems: itemsWithNames,
    });
  } catch (e) {
    console.error("PO creation failed (non-blocking):", e);
  }

  return invoiceId;
}
