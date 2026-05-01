import {
  addDoc,
  collection,
  getDocs,
  getDoc,
  query,
  where,
  serverTimestamp,
  runTransaction,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function formatPONumber(count: number): string {
  const year = new Date().getFullYear();
  return `PO-${year}-${String(count).padStart(3, "0")}`;
}

export async function createPurchaseOrdersForInvoice({
  orderId,
  invoiceId,
  deliveryDate,
  orderItems,
}: {
  orderId: string;
  invoiceId: string;
  deliveryDate?: string;
  orderItems: any[];
}) {
  // Group items by supplierId
  const bySupplier: Record<string, any[]> = {};
  for (const item of orderItems) {
    const sid = item.supplierId || "__none__";
    if (!bySupplier[sid]) bySupplier[sid] = [];
    bySupplier[sid].push(item);
  }

  // Skip items with no supplier
  delete bySupplier["__none__"];

  if (Object.keys(bySupplier).length === 0) return [];

  // Check existing POs for this order to avoid duplicates
  const existingSnap = await getDocs(
    query(collection(db, "purchaseOrders"), where("orderId", "==", orderId))
  );
  const existingSupplierIds = new Set(
    existingSnap.docs.map((d) => d.data().supplierId)
  );

  // Fetch suppliers
  const supplierIds = Object.keys(bySupplier);
  const supplierSnap = await getDocs(collection(db, "suppliers"));
  const suppliers: Record<string, any> = {};
  supplierSnap.docs.forEach((d) => {
    if (supplierIds.includes(d.id)) {
      suppliers[d.id] = { id: d.id, ...d.data() };
    }
  });

  // Fetch product details for weight notes
  const productIds = [...new Set(orderItems.map((i: any) => i.productId).filter(Boolean))];
  const productMap: Record<string, any> = {};
  for (const pid of productIds) {
    try {
      const snap = await getDoc(doc(db, "products", pid));
      if (snap.exists()) productMap[pid] = snap.data();
    } catch {}
  }

  // PO date = deliveryDate - 1 day
  let poDate = new Date().toISOString().slice(0, 10);
  if (deliveryDate) {
    const d = new Date(deliveryDate);
    d.setDate(d.getDate() - 1);
    poDate = d.toISOString().slice(0, 10);
  }

  const createdPOs: string[] = [];

  for (const [supplierId, items] of Object.entries(bySupplier)) {
    if (existingSupplierIds.has(supplierId)) continue;

    const supplier = suppliers[supplierId];
    if (!supplier) continue;

    const poContact = (supplier.contacts || []).find((c: any) => c.isPrimary);

    // Generate PO number
    const counterRef = doc(db, "settings", "poCounter");
    let poNumber = "";
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      const count = snap.exists() ? (snap.data().count || 0) : 0;
      const newCount = count + 1;
      poNumber = formatPONumber(newCount);
      transaction.set(counterRef, { count: newCount }, { merge: true });
    });

    const poTotal = items.reduce(
      (sum, item) => sum + Number(item.unitCostPrice || 0) * Number(item.quantity || 0),
      0
    );

    const poRef = await addDoc(collection(db, "purchaseOrders"), {
      poNumber,
      orderId,
      invoiceId,
      supplierId,
      supplierName: supplier.name || "",
      poContactName: poContact?.name || "",
      poContactPhone: poContact?.phone || "",
      poContactEmail: poContact?.email || "",
      poDate,
      deliveryDate: deliveryDate || "",
      status: "Generated",
      poTotal,
      items: items.map((item: any) => {
        const product = productMap[item.productId] || {};
        const unit = product.unit || "";
        // minWeightPerUnit / maxWeightPerUnit are stored in grams; convert to kg for PO notes
        const minG = Number(product.minWeightPerUnit || 0);
        const maxG = Number(product.maxWeightPerUnit || 0);
        const minW = minG / 1000;
        const maxW = maxG / 1000;
        const qty = Number(item.quantity || 0);
        let weightNote = "";
        if (minG > 0 && maxG > 0) {
          if (unit === "KG") {
            weightNote = `Approx. ${minG}–${maxG} g — final weight at delivery`;
          } else if (unit === "Piece") {
            const estMinKg = (qty * minW).toFixed(3);
            const estMaxKg = (qty * maxW).toFixed(3);
            weightNote = `Approx. ${minG}–${maxG} g each (est. total: ${estMinKg}–${estMaxKg} kg)`;
          }
        }
        const cost = Number(item.unitCostPrice || 0);
        return {
          productId: item.productId || "",
          productName: item.productName || "",
          quantity: qty,
          unitCostPrice: cost,
          lineTotal: cost * qty,
          weightNote,
          preparation: item.preparation || "",
          sample: item.sample || false,
          gift: item.gift || false,
        };
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    createdPOs.push(poRef.id);
  }

  return createdPOs;
}
