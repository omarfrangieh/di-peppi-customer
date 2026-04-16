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
      (sum, item) => (item.sample || item.gift) ? sum : sum + Number(item.unitCostPrice || 0) * Number(item.quantity || 0),
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
        const minW = Number(product.minWeightPerUnit || 0);
        const maxW = Number(product.maxWeightPerUnit || 0);
        const qty = Number(item.quantity || 0);
        let weightNote = "";
        if (minW > 0 && maxW > 0) {
          if (unit === "KG") {
            weightNote = `Approx. ${minW}–${maxW} kg — final weight at delivery`;
          } else if (unit === "Piece") {
            const estMin = (qty * minW).toFixed(2);
            const estMax = (qty * maxW).toFixed(2);
            weightNote = `Approx. ${minW}–${maxW} kg each (est. total: ${estMin}–${estMax} kg)`;
          }
        }
        const isFree = item.sample || item.gift;
        return {
          productId: item.productId || "",
          productName: item.productName || "",
          quantity: qty,
          unitCostPrice: isFree ? 0 : Number(item.unitCostPrice || 0),
          lineTotal: isFree ? 0 : Number(item.unitCostPrice || 0) * qty,
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
