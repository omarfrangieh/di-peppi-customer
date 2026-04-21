"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, Pencil, X } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPricing } from "@/lib/pricing";
import { createDraftInvoice } from "@/lib/createDraftInvoice";
import { syncOrderToInvoice } from "@/lib/syncOrderToInvoice";
import { formatQty, formatPrice } from "@/lib/formatters";
import { useRouter, useParams } from "next/navigation";

type Product = {
  id: string;
  name: string;
  productSubName?: string;
  supplier?: string;
  supplierId?: string;
  description?: string;
  category?: string;
  origin?: string;
  glaze?: string;
  unit?: string;
  storageType?: string;
  minStock?: number;
  active?: boolean;
  startingStock?: number;
  stockResetDate?: string;
  barcode?: string;
  barcodeData?: string;
  barcodeImage?: string;
  productImage?: string;
  currentStock: number;
  b2bPrice?: number;
  b2cPrice?: number;
  costPrice?: number;
};

type Order = {
  id: string;
  name: string;
  customerId?: string;
  customerType?: string;
  orderDate?: string;
  deliveryDate?: string;
  status?: string;
  deliveryStatus?: string;
  discountPercent?: number;
  deliveryFeesManual?: number;
  sample?: boolean;
  canceledAt?: string;
  canceledBy?: string;
  createdAt?: string;
  currency?: string;
  notes?: string;
};

type Customer = {
  id: string;
  name: string;
  deliveryFee?: number;
  customerType?: string;
  clientMargin?: number;
  clientDiscount?: number;
  specialPrices?: Record<string, number>;
  phone?: string;
  building?: string;
  apartment?: string;
  floor?: string;
  street?: string;
  city?: string;
  country?: string;
  additionalInstructions?: string;
  mapsLink?: string;
  manualHold?: boolean;
  active?: boolean;
};

type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  itemDiscountPercent?: number;
  itemDiscountAmount?: number;
  grossLineTotal?: number;
  netLineTotal?: number;
  totalPrice: number;
  unitCostPrice: number;
  totalCostPrice: number;
  profit: number;
  notes: string;
  preparation?: string;
  customerType?: string;
};

type CreateResult = {
  success?: boolean;
  orderItemId?: string;
  stockMovementId?: string;
  productId?: string;
  quantity?: number;
};

type PriceSource = "auto" | "vip" | "manual" | "cost";

type PricingResult = {
  unitPrice: number;
  unitCost: number;
  label: string;
  debug: string;
};

function money(value: unknown) {
  const num = Number(value || 0);
  return `$${formatPrice(num)}`;
}

/** Convert a Firestore Timestamp, serialised Timestamp object, or date string to YYYY-MM-DD */
function firestoreDateToString(val: any): string {
  if (!val) return "";
  // 1. Firestore Timestamp class instance
  if (val instanceof Timestamp) {
    return val.toDate().toISOString().slice(0, 10);
  }
  // 2. Timestamp-like object with toDate() (e.g. from older SDK builds)
  if (typeof val?.toDate === "function") {
    return (val.toDate() as Date).toISOString().slice(0, 10);
  }
  // 3. Plain serialised object { seconds, nanoseconds } (e.g. from Cloud Function JSON)
  if (typeof val === "object" && typeof val.seconds === "number") {
    return new Date(val.seconds * 1000).toISOString().slice(0, 10);
  }
  // 4. Stringified Timestamp like "Timestamp(seconds=..., nanoseconds=...)" — parse it
  if (typeof val === "string" && val.startsWith("Timestamp(")) {
    const m = val.match(/seconds=(\d+)/);
    if (m) return new Date(Number(m[1]) * 1000).toISOString().slice(0, 10);
    return "";
  }
  // 5. Already a valid YYYY-MM-DD or ISO date string
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10);
  }
  return "";
}

function cleanNumberInput(value: string) {
  if (value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function PriceSourceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium">
      {label}
    </span>
  );
}

function SummaryRow({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const urlOrderId = params?.id as string | undefined;
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [poReadiness, setPoReadiness] = useState<Record<string, { total: number; delivered: number }>>({});
  const [existingInvoiceId, setExistingInvoiceId] = useState<string | null>(null);
  const [existingInvoiceStatus, setExistingInvoiceStatus] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  // Guards the auto-save from firing before the order data has been loaded
  const [orderDataLoaded, setOrderDataLoaded] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [deletingItemId, setDeletingItemId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [weighingItemId, setWeighingItemId] = useState("");
  const [weighedQuantity, setWeighedQuantity] = useState("");
  const [preparation, setPreparation] = useState("");
  const [itemType, setItemType] = useState<"regular" | "sample" | "gift">("regular");
  const [editingPreparation, setEditingPreparation] = useState("");
  const [prepOptions, setPrepOptions] = useState<string[]>(["Portioned", "Whole", "Cleaned", "Skinless", "Sliced", "Headless & Gutted", "Gutted"]);
  const [editingQuantity, setEditingQuantity] = useState("");
  const [editingUnitPrice, setEditingUnitPrice] = useState("");
  const [priceSource, setPriceSource] = useState<PriceSource>("auto");

  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");

  const [itemDiscountPercent, setItemDiscountPercent] = useState("");
  const [itemDiscountAmount, setItemDiscountAmount] = useState("");

  const [editingItemDiscountPercent, setEditingItemDiscountPercent] =
    useState("");
  const [editingItemDiscountAmount, setEditingItemDiscountAmount] = useState("");

  const [manualPrice, setManualPrice] = useState(false);
  const [manualUnitPrice, setManualUnitPrice] = useState("");

  const hasDiscountPercent = Number(discountPercent || 0) > 0;
  const hasDiscountAmount = Number(discountAmount || 0) > 0;

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === customerId) || null;
  }, [customers, customerId]);

  const quantityNumber = useMemo(() => Number(quantity || 0), [quantity]);

  const pricing = useMemo<PricingResult>(() => {
    const value = getPricing({
      product: selectedProduct,
      customer: selectedCustomer,
      quantity: quantityNumber,
      isSample: itemType === "sample",
      isGift: itemType === "gift",
      ownerAtCost: false,
    }) as Partial<PricingResult> | undefined;

    return {
      unitPrice: Number(value?.unitPrice || 0),
      unitCost: Number(value?.unitCost || selectedProduct?.costPrice || 0),
      label: String(value?.label || "Auto Price"),
      debug: String(value?.debug || ""),
    };
  }, [selectedProduct, selectedCustomer, quantityNumber, itemType]);

  const finalUnitPrice = useMemo(() => {
    return manualPrice
      ? Number(manualUnitPrice || 0)
      : Number(pricing.unitPrice || 0);
  }, [manualPrice, manualUnitPrice, pricing.unitPrice]);

  const itemDiscountPercentNumber = Number(itemDiscountPercent || 0);
  const itemDiscountAmountNumber = Number(itemDiscountAmount || 0);

  const createGrossLineTotal = useMemo(() => {
    return Number(quantity || 0) * Number(finalUnitPrice || 0);
  }, [quantity, finalUnitPrice]);

  const createPercentDiscountValue = useMemo(() => {
    return createGrossLineTotal * (itemDiscountPercentNumber / 100);
  }, [createGrossLineTotal, itemDiscountPercentNumber]);

  const createTotalItemDiscount = useMemo(() => {
    return createPercentDiscountValue + itemDiscountAmountNumber;
  }, [createPercentDiscountValue, itemDiscountAmountNumber]);

  const createNetLineTotal = useMemo(() => {
    return Math.max(createGrossLineTotal - createTotalItemDiscount, 0);
  }, [createGrossLineTotal, createTotalItemDiscount]);

  const grossSubtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const grossLine = Number(item.grossLineTotal || 0) || Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return sum + grossLine;
    }, 0);
  }, [orderItems]);

  const netSubtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const grossLine = Number(item.grossLineTotal || 0) || Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const itemDiscountCalc = (grossLine * Number(item.itemDiscountPercent || 0) / 100) + Number(item.itemDiscountAmount || 0);
      const netLine = Math.max(grossLine - itemDiscountCalc, 0);
      return sum + netLine;
    }, 0);
  }, [orderItems]);

  const itemDiscountTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const grossLine =
        Number(item.grossLineTotal || 0) ||
        Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const itemDiscountCalc = (grossLine * Number(item.itemDiscountPercent || 0) / 100) + Number(item.itemDiscountAmount || 0);
      return sum + itemDiscountCalc;
    }, 0);
  }, [orderItems]);

  const totalCostPrice = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitCostPrice || 0)), 0);
  }, [orderItems]);

  const totalProfit = useMemo(() => {
    return Math.max(netSubtotal - totalCostPrice, 0);
  }, [netSubtotal, totalCostPrice]);

  const discountPercentNumber = Number(discountPercent || 0);
  const discountAmountNumber = Number(discountAmount || 0);
  const allItemsFree = orderItems.length > 0 && orderItems.every((item) => (item as any).sample || (item as any).gift);
  const deliveryFeeNumber = allItemsFree ? 0 : Number(deliveryFee || 0);

  const orderPercentDiscountValue = useMemo(() => {
    if (!discountPercentNumber || discountPercentNumber <= 0) return 0;
    return netSubtotal * (discountPercentNumber / 100);
  }, [netSubtotal, discountPercentNumber]);

  const orderDiscountValue = useMemo(() => {
    return discountPercentNumber > 0
      ? orderPercentDiscountValue
      : discountAmountNumber;
  }, [discountPercentNumber, orderPercentDiscountValue, discountAmountNumber]);

  const orderDiscountTotal = useMemo(() => {
    return orderPercentDiscountValue + discountAmountNumber;
  }, [orderPercentDiscountValue, discountAmountNumber]);

  const roundToHalf = (value: number) => Math.round(value * 2) / 2;

  const finalTotal = useMemo(() => {
    const raw = Math.max(netSubtotal - orderDiscountValue + deliveryFeeNumber, 0);
    const customerType = selectedCustomer?.customerType || "";
    return customerType === "B2C" ? roundToHalf(raw) : raw;
  }, [netSubtotal, orderDiscountValue, deliveryFeeNumber]);

  const rawFinalTotal = Math.max(netSubtotal - orderDiscountValue + deliveryFeeNumber, 0);
  const roundingAdjustment = finalTotal - rawFinalTotal;

  const editingItemDiscountPercentNumber = Number(
    editingItemDiscountPercent || 0
  );
  const editingItemDiscountAmountNumber = Number(
    editingItemDiscountAmount || 0
  );

  const editGrossLineTotal = useMemo(() => {
    return Number(editingQuantity || 0) * Number(editingUnitPrice || 0);
  }, [editingQuantity, editingUnitPrice]);

  const editPercentDiscountValue = useMemo(() => {
    return editGrossLineTotal * (editingItemDiscountPercentNumber / 100);
  }, [editGrossLineTotal, editingItemDiscountPercentNumber]);

  const editTotalItemDiscount = useMemo(() => {
    return editPercentDiscountValue + editingItemDiscountAmountNumber;
  }, [editPercentDiscountValue, editingItemDiscountAmountNumber]);

  const editNetLineTotal = useMemo(() => {
    return Math.max(editGrossLineTotal - editTotalItemDiscount, 0);
  }, [editGrossLineTotal, editTotalItemDiscount]);

  const loadPrepOptions = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "productOptions"));
      if (snap.exists() && snap.data().preparation) {
        setPrepOptions(snap.data().preparation);
      }
    } catch (e) {}
  };

  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));

      const data: Product[] = snap.docs.map((docSnap) => {
        const raw = docSnap.data();

        return {
          id: docSnap.id,
          name: String(raw.name || raw.Product || "Unnamed Product"),
          productSubName: String(raw.productSubName || raw.ProductSubName || ""),
          supplier: String(raw.supplier || raw.Supplier || ""),
          supplierId: String(raw.supplierId || ""),
          description: String(raw.description || raw.Description || ""),
          category: String(raw.category || raw.Category || ""),
          origin: String(raw.origin || raw.Origin || ""),
          glaze: String(raw.glaze || raw.Glaze || ""),
          unit: String(raw.unit || raw.Unit || ""),
          storageType: String(raw.storageType || raw.StorageType || raw["Storage Type"] || ""),
          minStock: Number(raw.minStock || raw.MinStock || raw["Min Stock"] || 0),
          active: raw.active !== undefined ? Boolean(raw.active) : true,
          startingStock: Number(raw.startingStock || raw.StartingStock || 0),
          barcode: String(raw.barcode || raw.Barcode || ""),
          barcodeData: String(raw.barcodeData || raw.BarcodeData || ""),
          barcodeImage: String(raw.barcodeImage || raw.BarcodeImage || ""),
          productImage: String(raw.productImage || raw.ProductImage || raw["Product Image"] || ""),
          stockResetDate: String(raw.stockResetDate || raw.StockResetDate || ""),
          currentStock: Number(raw.currentStock || 0),
          costPrice: Number(raw.costPrice || 0),
          b2bPrice: Number(raw.b2bPrice || 0),
          b2cPrice: Number(raw.b2cPrice || 0),
        };
      });

      setProducts(data.filter(p => p.active !== false));
} catch (error: any) {
  console.error(
    "Error loading products:",
    error?.code,
    error?.message,
    error
  );
  setProducts([]);
}
  };

  const loadOrders = async () => {
    try {
      const res = await fetch(
        "https://us-central1-di-peppi.cloudfunctions.net/getOrders"
      );
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading orders:", error);
      setOrders([]);
    }
    try {
      const snap = await getDocs(collection(db, "purchaseOrders"));
      const readiness: Record<string, { total: number; delivered: number }> = {};
      snap.forEach(d => {
        const po = d.data();
        if (!po.orderId) return;
        if (!readiness[po.orderId]) readiness[po.orderId] = { total: 0, delivered: 0 };
        readiness[po.orderId].total += 1;
        if (po.status === "Delivered" || po.status === "Paid") {
          readiness[po.orderId].delivered += 1;
        }
      });
      setPoReadiness(readiness);
    } catch (e) {
      console.error("Error loading PO readiness:", e);
    }
  };

  const createNewOrder = async () => {
    if (!customerId) { alert("Please select a customer first."); return; }
    try {
      const customer = customers.find(c => c.id === customerId);
      const { addDoc, collection, serverTimestamp, runTransaction, doc, getDoc } = await import("firebase/firestore");
      const year = new Date().getFullYear();
      const yy = String(year).slice(-2);
      const counterRef = doc(db, "settings", `orderCounter_${year}`);
      let orderNumber = "";
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        const count = snap.exists() ? (snap.data().count || 0) : 0;
        const newCount = count + 1;
        orderNumber = `ORD-${yy}-${String(newCount).padStart(3, "0")}`;
        transaction.set(counterRef, { count: newCount }, { merge: true });
      });
      const orderRef = await addDoc(collection(db, "orders"), {
          customerId,
          customerName: customer?.name || "",
          customerType: customer?.customerType || "",
          name: orderNumber,
          orderDate: new Date().toISOString().slice(0, 10),
          deliveryDate: "",
          status: "Draft",
          notes: "",
          discountPercent: 0,
          discountAmount: 0,
          deliveryFee: Number(customer?.deliveryFee || 0),
          subtotal: 0,
          grossSubtotal: 0,
          itemDiscountTotal: 0,
          finalTotal: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      await loadOrders();
      setSelectedOrderId(orderRef.id);
    } catch (e) {
      console.error("Error creating order:", e);
      alert("Failed to create order.");
    }
  };

  const loadCustomers = async () => {
    try {
      const snap = await getDocs(collection(db, "customers"));

      const data: Customer[] = snap.docs.map((docSnap) => {
        const raw = docSnap.data();

        return {
          id: docSnap.id,
          name: String(
            raw.Name ??
              raw.name ??
              raw.Customer ??
              raw.customerName ??
              "Unnamed Customer"
          ),
          customerType: String(
            raw.customerType ??
              raw["Customer Type"] ??
              raw.type ??
              raw.Type ??
              "B2C"
          ),
          deliveryFee:
            raw.deliveryFee !== undefined
              ? Number(raw.deliveryFee)
              : raw["Delivery Fee"] !== undefined
              ? Number(raw["Delivery Fee"])
              : raw.delivery_fees !== undefined
              ? Number(raw.delivery_fees)
              : 0,
          clientMargin:
            raw.clientMargin !== undefined
              ? Number(raw.clientMargin)
              : raw["Client Margin"] !== undefined
              ? Number(raw["Client Margin"])
              : raw.margin !== undefined
              ? Number(raw.margin)
              : 0,
          specialPrices:
            raw.specialPrices && typeof raw.specialPrices === "object"
              ? (raw.specialPrices as Record<string, number>)
              : undefined,
          phone: String(raw.phone ?? raw.Phone ?? raw.mobile ?? raw.Mobile ?? raw["Phone Number"] ?? ""),
          building: String(raw.customerBuilding || raw.building || raw.Building || ""),
          apartment: String(raw.customerApartment || raw.apartment || raw.Apartment || ""),
          floor: String(raw.customerFloor || raw.floor || raw.Floor || ""),
          city: String(raw.customerCity || raw.city || raw.City || ""),
          country: String(raw.customerCountry || raw.country || raw.Country || ""),
          additionalInstructions: String(raw.additionalInstructions ?? raw["Additional Instructions"] ?? ""),
          street: String(raw.street ?? raw.Street ?? ""),
          mapsLink: String(raw.mapsLink ?? raw["Google Maps Location"] ?? ""),
          manualHold: Boolean(raw.manualHold ?? raw["Manual Hold"] ?? false),
          clientDiscount: Number(raw.clientDiscount ?? raw["Client Discount %"] ?? 0),
          active: raw.active !== undefined ? Boolean(raw.active) : true,
        };
      });

      setCustomers(
        data
          .filter(c => c.active !== false && !c.manualHold)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      );
} catch (error: any) {
  console.error(
    "Error loading customers:",
    error?.code,
    error?.message,
    error
  );
  setCustomers([]);
}
  };

  const loadOrderItems = async (orderId: string) => {
    if (!orderId) {
      setOrderItems([]);
      return;
    }

    try {
      const res = await fetch(
        `https://us-central1-di-peppi.cloudfunctions.net/getOrderItems?orderId=${encodeURIComponent(
          orderId
        )}`
      );
      const data = await res.json();
      setOrderItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading order items:", error);
      setOrderItems([]);
    }
  };

  const resetOrderHeader = () => {
    setDiscountPercent("");
    setDiscountAmount("");
    setDeliveryFee("");
    setCustomerId("");
    setOrderDate("");
    setDeliveryDate("");
    setOrderStatus("");
    setOrderNotes("");
  };

  const loadOrderTotals = async (orderId: string) => {
    setOrderDataLoaded(false);
    if (!orderId) {
      resetOrderHeader();
      return;
    }

    try {
      const snap = await getDoc(doc(db, "orders", orderId));

      if (!snap.exists()) {
        resetOrderHeader();
        return;
      }

      const data = snap.data();

      setDiscountPercent(
        data.discountPercent !== undefined
          ? String(Number(data.discountPercent))
          : ""
      );
      setDiscountAmount(
        data.discountAmount !== undefined
          ? String(Number(data.discountAmount))
          : ""
      );
      setDeliveryFee(
        data.deliveryFee !== undefined ? String(Number(data.deliveryFee)) : ""
      );
      setCustomerId(data.customerId !== undefined ? String(data.customerId) : "");
      setOrderDate(data.orderDate !== undefined ? firestoreDateToString(data.orderDate) : "");
      setDeliveryDate(data.deliveryDate !== undefined ? firestoreDateToString(data.deliveryDate) : "");
      setOrderStatus(data.status !== undefined ? String(data.status) : "");
      setOrderNotes(data.notes !== undefined ? String(data.notes) : "");
      setOrderDataLoaded(true);
    } catch (error) {
      console.error("Error loading order totals:", error);
      resetOrderHeader();
    }
  };

  const saveOrderTotals = async () => {
    if (!selectedOrderId) return;

    try {
      await updateDoc(doc(db, "orders", selectedOrderId), {
        customerId,
        orderDate,
        deliveryDate,
        status: orderStatus,
        notes: orderNotes,
        discountPercent: discountPercentNumber,
        discountAmount: discountAmountNumber,
        deliveryFee: deliveryFeeNumber,
        subtotal: netSubtotal,
        grossSubtotal,
        itemDiscountTotal,
        totalDiscount: orderDiscountTotal,
        finalTotal,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error saving order totals:", error);
    }
  };

  useEffect(() => {
    void loadProducts();
    void loadOrders();
    void loadCustomers();
    void loadPrepOptions();
  }, []);


  useEffect(() => {
    if (urlOrderId && urlOrderId !== "new" && orders.length > 0) {
      const order = orders.find(o => o.id === urlOrderId);
      if (order) {
        setCustomerId(order.customerId || "");
        setSelectedOrderId(urlOrderId);
      }
      getDocs(query(collection(db, "invoices"), where("orderId", "==", urlOrderId))).then(snap => {
        if (!snap.empty) {
          setExistingInvoiceId(snap.docs[0].id);
          setExistingInvoiceStatus(snap.docs[0].data().status || "draft");
        }
      });
    }
  }, [urlOrderId, orders]);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderItems([]);
      resetOrderHeader();
      return;
    }

    void loadOrderItems(selectedOrderId);
    void loadOrderTotals(selectedOrderId);
  }, [selectedOrderId]);

  useEffect(() => {
    if (!result) return;

    const timer = setTimeout(() => {
      setItemType("regular");
      setResult("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (!customerId || !selectedCustomer) return;
    setDeliveryFee(String(Number(selectedCustomer.deliveryFee || 0)));
  }, [customerId, selectedCustomer]);

  useEffect(() => {
    // Do NOT save until the order data has been fully loaded from Firestore.
    // Without this guard, the auto-save fires with the empty initial state and
    // overwrites the real order data (status, dates, etc.) before they are loaded.
    if (!selectedOrderId || !orderDataLoaded) return;

    const timer = setTimeout(() => {
      void saveOrderTotals();
    }, 500);

    return () => clearTimeout(timer);
  }, [
    selectedOrderId,
    orderDataLoaded,
    customerId,
    orderDate,
    orderStatus,
    orderNotes,
    grossSubtotal,
    itemDiscountTotal,
    netSubtotal,
    discountPercentNumber,
    discountAmountNumber,
    deliveryFeeNumber,
    orderDiscountTotal,
    finalTotal,
  ]);

  const createItem = async () => {
    setResult("");

    if (!selectedOrderId) {
      setResult("Please select an order.");
      return;
    }

    if (!customerId) {
      setResult("Please select a customer.");
      return;
    }

    if (!selectedProductId) {
      setResult("Please select a product.");
      return;
    }

    const qty = Number(quantity);

    if (!qty || qty <= 0) {
      setResult("Please enter a valid quantity.");
      return;
    }

    if (selectedProduct && qty > Number(selectedProduct.currentStock || 0)) {
      setResult(
        `Insufficient stock. Requested ${qty}, available ${selectedProduct.currentStock}.`
      );
      return;
    }

    if (finalUnitPrice <= 0 && itemType === "regular") {
      setResult("Calculated unit price is 0. Check pricing setup.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        "https://us-central1-di-peppi.cloudfunctions.net/createOrderItemCallable",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              orderId: selectedOrderId,
              productId: selectedProductId,
              quantity: qty,
              unitPrice: finalUnitPrice,
              unitCostPrice: Number(pricing.unitCost || 0),
              itemDiscountPercent: itemDiscountPercentNumber,
              itemDiscountAmount: itemDiscountAmountNumber,
              grossLineTotal: createGrossLineTotal,
              netLineTotal: createNetLineTotal,
              notes: `UI create | ${manualPrice ? "Manual Price" : pricing.label}`,
              customerType: selectedCustomer?.customerType || "",
              preparation: preparation,
              sample: itemType === "sample",
              gift: itemType === "gift",
            },
          }),
        }
      );

      const text = await res.text();

      if (!res.ok) {
        try {
          const err = JSON.parse(text);
          setResult(err?.error?.message || "Create failed");
        } catch {
          setResult("Create failed");
        }
        return;
      }

      let parsed: { result?: CreateResult } | CreateResult | null = null;

      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      const payload =
        (parsed as { result?: CreateResult })?.result ||
        (parsed as CreateResult);

      setResult(
        payload?.success
          ? `Created successfully. Order Item ID: ${payload.orderItemId || "N/A"}`
          : "Created successfully."
      );

      setQuantity("");
      setSelectedProductId("");
      setManualPrice(false);
      setManualUnitPrice("");
      setItemDiscountPercent("");
      setItemDiscountAmount("");

      await loadProducts();
      await loadOrderItems(selectedOrderId);
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (orderItemId: string) => {
    if (!orderItemId) return;

    setDeletingItemId(orderItemId);
    setResult("");

    try {
      const res = await fetch(
        "https://us-central1-di-peppi.cloudfunctions.net/deleteOrderItemCallable",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: { orderItemId },
          }),
        }
      );

      const text = await res.text();

      if (!res.ok) {
        try {
          const err = JSON.parse(text);
          setResult(err?.error?.message || "Delete failed");
        } catch {
          setResult("Delete failed");
        }
        return;
      }

      setResult("Item deleted successfully.");
      await loadProducts();
      await loadOrderItems(selectedOrderId);
    } catch (error) {
      setResult(
        `Delete error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setDeletingItemId("");
    }
  };

  const startEdit = (item: OrderItem) => {
    setResult("");
    setEditingItemId(item.id);
    setEditingQuantity(String(item.quantity));
    setEditingUnitPrice(String(item.unitPrice));
    setEditingItemDiscountPercent(String(item.itemDiscountPercent || 0));
    setEditingItemDiscountAmount(String(item.itemDiscountAmount || 0));
    setEditingPreparation(String(item.preparation || ""));

    const vipPrice = selectedCustomer?.specialPrices?.[item.productId];

    if (vipPrice !== undefined && Number(item.unitPrice) === Number(vipPrice)) {
      setPriceSource("vip");
    } else if (Number(item.unitPrice) === Number(item.unitCostPrice || 0)) {
      setPriceSource("cost");
    } else {
      setPriceSource("manual");
    }
  };

  const cancelEdit = () => {
    setEditingPreparation("");
    setPreparation("");
    setResult("");
    setEditingItemId("");
    setEditingQuantity("");
    setEditingUnitPrice("");
    setEditingItemDiscountPercent("");
    setEditingItemDiscountAmount("");
    setPriceSource("manual");
  };

  const getEditableMaxQty = (item: OrderItem) => {
    const product = products.find((p) => p.id === item.productId);
    const currentStock = Number(product?.currentStock || 0);
    const originalQty = Number(item.quantity || 0);
    return currentStock + originalQty;
  };

  const updateItem = async (item: OrderItem) => {
    setResult("");

    const qty = Number(editingQuantity);
    const unitPrice = Number(editingUnitPrice);
    const maxQty = getEditableMaxQty(item);

    if (!qty || qty <= 0) {
      setResult("Please enter a valid quantity.");
      return;
    }

    if (qty > maxQty) {
      setResult(`Insufficient stock. Maximum allowed is ${maxQty}.`);
      return;
    }

    if (!unitPrice || unitPrice <= 0) {
      setResult("Please enter a valid unit price.");
      return;
    }

    if (unitPrice < Number(item.unitCostPrice || 0)) {
      setResult("Price is below cost. Please review before saving.");
      return;
    }

    try {
      const res = await fetch(
        "https://us-central1-di-peppi.cloudfunctions.net/updateOrderItemCallable",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              orderItemId: item.id,
              productId: item.productId,
              quantity: qty,
              unitPrice,
              unitCostPrice: Number(item.unitCostPrice || 0),
              itemDiscountPercent: editingItemDiscountPercentNumber,
              itemDiscountAmount: editingItemDiscountAmountNumber,
              grossLineTotal: editGrossLineTotal,
              netLineTotal: editNetLineTotal,
              notes: item.notes || "",
              customerType: selectedCustomer?.customerType || "",
              preparation: editingPreparation,
              sample: itemType === "sample",
              gift: itemType === "gift",
            },
          }),
        }
      );

      const text = await res.text();

      if (!res.ok) {
        try {
          const err = JSON.parse(text);
          setResult(err?.error?.message || "Update failed");
        } catch {
          setResult("Update failed");
        }
        return;
      }

      setResult("Item updated successfully.");
      setEditingItemId("");
      setEditingQuantity("");
      setEditingUnitPrice("");
      setEditingItemDiscountPercent("");
      setEditingItemDiscountAmount("");

      await loadProducts();
      await loadOrderItems(selectedOrderId);
    } catch (error) {
      setResult(
        `Update error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const editingItem = useMemo(() => {
    return orderItems.find((item) => item.id === editingItemId) || null;
  }, [orderItems, editingItemId]);

  const editingMarginPercent = useMemo(() => {
    if (!editingItem) return 0;
    const unitPrice = Number(editingUnitPrice || 0);
    const cost = Number(editingItem.unitCostPrice || 0);
    if (unitPrice <= 0) return 0;
    return ((unitPrice - cost) / unitPrice) * 100;
  }, [editingItem, editingUnitPrice]);

  const productCardUnitPrice = Number(finalUnitPrice || 0);
  const productCardUnitCost = Number(pricing.unitCost || 0);
  const productCardQty = Number(quantityNumber || 0);
  const productCardMargin =
    productCardUnitPrice > 0
      ? ((productCardUnitPrice - productCardUnitCost) / productCardUnitPrice) *
        100
      : 0;

  // ── READ-ONLY VIEW when invoice is locked (not draft) ──────────────────────
  if (existingInvoiceId && selectedOrderId && existingInvoiceStatus !== "draft") {
    const order = orders.find(o => o.id === selectedOrderId);
    const customer = customers.find(c => c.id === customerId);
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            
            <div>
              <p className="text-sm font-semibold text-gray-900">{order?.name || selectedOrderId}</p>
              <p className="text-xs text-gray-400">{customer?.name} · {order?.customerType}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              order?.status === "Delivered" ? "bg-green-100 text-green-800 border border-green-300" :
              order?.status === "Preparing" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" :
              order?.status === "To Deliver" ? "bg-orange-100 text-orange-700 border border-orange-300" :
              "bg-gray-100 text-gray-600"
            }`}>{order?.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/admin/orders")}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium"
              style={{backgroundColor: "#1B2A5E"}}>
              + New Order
            </button>
            {existingInvoiceStatus === "draft" && (
              <button
                onClick={async () => {
                  if (!confirm("Delete this order and its draft invoice? This cannot be undone.")) return;
                  try {
                    const { doc, deleteDoc } = await import("firebase/firestore");
                    const { db } = await import("@/lib/firebase");
                    await deleteDoc(doc(db, "invoices", existingInvoiceId));
                    await deleteDoc(doc(db, "orders", selectedOrderId));
                    router.push("/admin/orders");
                  } catch (e) {
                    alert("Failed to delete order");
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-lg font-medium bg-red-50 text-red-500 border border-red-200 hover:bg-red-100">
                🗑 Delete
              </button>
            )}
            <button onClick={() => router.push(`/invoices/${existingInvoiceId}`)}
              className="px-4 py-2 text-sm text-white rounded-lg font-medium"
              style={{backgroundColor: "#1B2A5E"}}>
              {existingInvoiceStatus === "draft" ? "Edit Invoice →" : "View Invoice →"}
            </button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Order Info */}
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">Customer</p>
                <p className="font-medium text-gray-900">{customer?.name || "—"}</p>
                <p className="text-xs text-gray-500">{customer?.customerType}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Order Date</p>
                <p className="font-medium text-gray-900">{orderDate ? orderDate.split("-").reverse().join("-") : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Delivery Date</p>
                <p className="font-medium" style={{color: "#B5535A"}}>{deliveryDate ? deliveryDate.split("-").reverse().join("-") : "—"}</p>
              </div>
              {orderNotes && <div className="col-span-3"><p className="text-xs text-gray-400 mb-1">Notes</p><p className="text-gray-700">{orderNotes}</p></div>}
            </div>
          </div>
          {/* Invoice banner */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${existingInvoiceStatus === "draft" ? "bg-yellow-50 border-yellow-200" : "bg-blue-50 border-blue-200"}`}>
            <p className="text-sm font-medium text-gray-800">
              {existingInvoiceStatus === "draft" ? "🟡 Draft Invoice — open to edit items" : "🔒 Invoice locked — no further edits"}
            </p>
          </div>
          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">Order Items</h3>
            </div>
            {orderItems.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">No items</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orderItems.map((item) => {
                  const qtyXPrice = Number(item.quantity) * Number(item.unitPrice);
                  const displayGross = Number(item.grossLineTotal || 0) || qtyXPrice;
                  const displayNet = Number(item.netLineTotal || 0) || Number(item.totalPrice || 0) || qtyXPrice;
                  const discount = Math.max(displayGross - displayNet, 0);
                  return (
                    <div key={item.id} className="px-6 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">Qty: <span className="font-medium">{formatQty(item.quantity)}</span> × ${formatPrice(item.unitPrice)}</span>
                          {discount > 0 && <span className="text-xs text-red-500">-${formatPrice(discount)}</span>}
                          {item.preparation && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">🔪 {item.preparation}</span>}
                          {(item as any).sample && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">🧪 Sample</span>}
                          {(item as any).gift && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">🎁 Gift</span>}
                        </div>
                      </div>
                      <p className="font-semibold text-gray-900">${formatPrice(displayNet)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-1 text-sm">
              {deliveryFeeNumber > 0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span>${formatPrice(deliveryFeeNumber)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
                <span>Total</span><span style={{color: "#1B2A5E"}}>${formatPrice(finalTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── EDITABLE VIEW ──────────────────────────────────────────
  const isNewPage = urlOrderId === "new";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          
          {selectedOrderId && (
            <>
              <div className="h-4 w-px bg-gray-200" />
              <p className="text-sm font-semibold text-gray-900">
                {orders.find(o => o.id === selectedOrderId)?.name || "New Order"}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                orderStatus === "Draft" ? "bg-gray-200 text-gray-700 border border-gray-300" :
                orderStatus === "Preparing" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" :
                orderStatus === "To Deliver" ? "bg-orange-100 text-orange-700 border border-orange-300" :
                orderStatus === "Delivered" ? "bg-green-100 text-green-800 border border-green-300" :
                orderStatus === "Cancelled" ? "bg-red-100 text-red-700 border border-red-300" :
                "bg-gray-200 text-gray-700"
              }`}>
                {orderStatus === "Draft" ? "📝 Draft" :
                 orderStatus === "Preparing" ? "🟡 Preparing" :
                 orderStatus === "To Deliver" ? "🚚 To Deliver" :
                 orderStatus === "Delivered" ? "✅ Delivered" :
                 orderStatus === "Cancelled" ? "❌ Cancelled" : "📝 Draft"}
              </span>
              {poReadiness[selectedOrderId]?.total > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  poReadiness[selectedOrderId].delivered === poReadiness[selectedOrderId].total
                    ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                }`}>📦 POs {poReadiness[selectedOrderId].delivered}/{poReadiness[selectedOrderId].total}</span>
              )}
              {(orderStatus === "Draft" || orderStatus === "Preparing") && !existingInvoiceId && (
                <button
                  onClick={async () => {
                    if (!confirm("Delete this order? This cannot be undone.")) return;
                    try {
                      const { doc, deleteDoc } = await import("firebase/firestore");
                      const { db } = await import("@/lib/firebase");
                      await deleteDoc(doc(db, "orders", selectedOrderId));
                      router.push("/admin/orders");
                    } catch (e) {
                      alert("Failed to delete order");
                    }
                  }}
                  className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-500 border border-red-200 hover:bg-red-100">
                  🗑 Delete
                </button>
              )}
            </>
          )}
        </div>

      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* Step 1: Customer + New Order */}
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Customer</label>
            {!isNewPage ? (
              <div className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-500">
                {customers.find(c => c.id === customerId)?.name || "—"}
              </div>
            ) : (
              <div className="relative mt-1">
                {/* Selected display / search input */}
                <div
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white flex items-center gap-2 cursor-pointer"
                  onClick={() => { setCustomerDropdownOpen(o => !o); setCustomerSearch(""); }}
                >
                  {customerId ? (
                    <span className="flex-1 text-gray-900">{customers.find(c => c.id === customerId)?.name || "—"}</span>
                  ) : (
                    <span className="flex-1 text-gray-400">Select Customer</span>
                  )}
                  <span className="text-gray-400 text-xs">{customerDropdownOpen ? "▲" : "▼"}</span>
                </div>

                {/* Dropdown panel */}
                {customerDropdownOpen && (
                  <>
                    {/* Backdrop — catches outside clicks without event propagation conflicts */}
                    <div className="fixed inset-0 z-40" onClick={() => { setCustomerDropdownOpen(false); setCustomerSearch(""); }} />
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                      {/* Search */}
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search customers..."
                            value={customerSearch}
                            onChange={e => setCustomerSearch(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                          {customerSearch && (
                            <button
                              onClick={() => setCustomerSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                              type="button"
                              title="Clear search"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      {/* List */}
                      <div className="max-h-64 overflow-y-auto">
                        {customers
                          .filter(c => (c.name || "").toLowerCase().includes(customerSearch.toLowerCase()))
                          .map(c => (
                            <div
                              key={c.id}
                              onClick={() => { setCustomerId(c.id); setSelectedOrderId(""); setCustomerDropdownOpen(false); setCustomerSearch(""); }}
                              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between ${c.id === customerId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"}`}
                            >
                              <span>{c.name}</span>
                              {c.customerType && <span className="text-xs text-gray-400">{c.customerType}</span>}
                            </div>
                          ))}
                        {customers.filter(c => (c.name || "").toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                          <div className="px-4 py-4 text-sm text-gray-400 text-center">No customers found</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {selectedCustomer && (
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span><span className="font-bold text-gray-700">Type:</span> {selectedCustomer.customerType || "B2C"}</span>
                <span><span className="font-bold text-gray-700">Margin:</span> {selectedCustomer.clientMargin || 0}</span>
                <span><span className="font-bold text-gray-700">Delivery:</span> ${formatPrice(selectedCustomer.deliveryFee || 0)}</span>
              </div>
            )}
          </div>
          {isNewPage && !selectedOrderId && (
            <button onClick={createNewOrder} disabled={!customerId}
              className="w-full py-2 text-sm text-white rounded-lg font-bold disabled:opacity-40"
              style={{backgroundColor: "#1B2A5E"}}>
              + New Order
            </button>
          )}
          {selectedOrderId && !existingInvoiceId && (
            <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
              ✅ Order saved automatically as Draft
            </div>
          )}
        </div>

        {/* Step 2: Order details — only after order created */}
        {selectedOrderId && (
          <>
            {existingInvoiceId && existingInvoiceStatus === "draft" && (
              <div className="rounded-xl px-4 py-3 border bg-yellow-50 border-yellow-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">🟡 Draft Invoice exists</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!confirm("Sync all order items to invoice? This will replace all invoice lines and regenerate POs.")) return;
                        setSyncing(true); setSyncResult("");
                        try {
                          const order = orders.find(o => o.id === selectedOrderId);
                          await syncOrderToInvoice({
                            orderId: selectedOrderId,
                            invoiceId: existingInvoiceId,
                            order: { ...order, deliveryFee: deliveryFeeNumber, discountPercent: discountPercentNumber, discountAmount: discountAmountNumber },
                            customer: selectedCustomer,
                          });
                          setSyncResult("✅ Synced successfully!");
                        } catch (e: any) {
                          setSyncResult("❌ Sync failed: " + e.message);
                        } finally { setSyncing(false); }
                      }}
                      disabled={syncing}
                      className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
                      style={{backgroundColor: "#B5535A"}}>
                      {syncing ? "Syncing..." : "🔄 Sync to Invoice"}
                    </button>
                    <button onClick={() => router.push(`/invoices/${existingInvoiceId}`)}
                      className="px-4 py-2 text-sm text-white rounded-lg font-medium"
                      style={{backgroundColor: "#1B2A5E"}}>
                      View Invoice →
                    </button>
                  </div>
                </div>
                {syncResult && <p className="text-xs font-medium text-gray-700">{syncResult}</p>}
                <p className="text-xs text-gray-500">Add/edit items here, then click "Sync to Invoice" to push changes.</p>
              </div>
            )}

            {/* Dates & Status */}
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📅 Dates & Status</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Order Date</label>
                  <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Delivery Date *</label>
                  <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className={!deliveryDate ? "border-red-300" : ""} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs text-gray-500">Status</label>
                <select className="flex-1 rounded-lg border px-3 py-1.5 text-sm" value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value)}>
                  <option value="Draft">📝 Draft</option>
                  <option value="Preparing">🟡 Preparing</option>
                  <option value="Cancelled">❌ Cancelled</option>
                </select>
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                <textarea className="w-full rounded-lg border px-3 py-2 text-sm min-h-[70px]"
                  placeholder="Order notes..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
              </div>
            </div>

            {/* Add Product */}
            <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">➕ Add Product</h3>
              <select className="w-full rounded-lg border px-3 py-2 text-sm" value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}>
                <option value="">Select Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.currentStock <= 0}>
                    {p.name} ({formatQty(p.currentStock)})
                  </option>
                ))}
              </select>

              {selectedProduct && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Stock</span>
                    <span className="font-medium">{formatQty(selectedProduct.currentStock)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cost</span>
                    <span className="font-medium">{money(productCardUnitCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{manualPrice ? "Manual Price" : "Auto Price"}</span>
                    <span className="font-medium">{money(productCardUnitPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Margin</span>
                    <span className={`font-semibold ${productCardMargin < 0 ? "text-red-600" : productCardMargin < 15 ? "text-yellow-600" : "text-green-600"}`}>
                      {productCardMargin.toFixed(1)}%
                    </span>
                  </div>
                  {productCardQty > 0 && (
                    <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                      <span className="text-gray-500">Line Total</span>
                      <span className="font-semibold">{money(createNetLineTotal)}</span>
                    </div>
                  )}
                  <label className="flex items-center gap-2 pt-1">
                    <input type="checkbox" checked={manualPrice} onChange={(e) => {
                      setManualPrice(e.target.checked);
                      if (e.target.checked) setManualUnitPrice(String(pricing.unitPrice));
                      else setManualUnitPrice("");
                    }} />
                    <span className="text-gray-600">Override price manually</span>
                  </label>
                  {manualPrice && (
                    <div className="space-y-1">
                      <Input type="number" placeholder="Unit price" value={manualUnitPrice}
                        onChange={(e) => setManualUnitPrice(e.target.value)} className="text-sm" />
                      <div className="flex gap-2">
                        <button onClick={() => setManualUnitPrice(String(pricing.unitPrice))}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">Auto</button>
                        {selectedCustomer?.specialPrices?.[selectedProduct.id] !== undefined && (
                          <button onClick={() => setManualUnitPrice(String(selectedCustomer.specialPrices![selectedProduct.id]))}
                            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">VIP</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
                  <Input type="number" placeholder="0" value={quantity}
                    max={selectedProduct?.currentStock || undefined}
                    onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Preparation</label>
                  <select value={preparation} onChange={e => setPreparation(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-white">
                    <option value="">— None —</option>
                    {prepOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="mb-1">
                <label className="text-xs text-gray-500 mb-1 block">Item Type</label>
                <div className="flex gap-1">
                  {([["regular","Regular","⚪"],["sample","Sample","🧪"],["gift","Gift","🎁"]] as const).map(([val,label,icon]) => (
                    <button key={val} type="button" onClick={() => setItemType(val)}
                      className={"flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors " + (itemType === val ? "text-white border-transparent" : "text-gray-500 border-gray-200 hover:bg-gray-50")}
                      style={itemType === val ? {backgroundColor: val === "regular" ? "#1B2A5E" : val === "sample" ? "#7C3AED" : "#D97706"} : {}}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Item Discount %</label>
                  <Input type="number" placeholder="0" value={itemDiscountPercent}
                    disabled={Number(itemDiscountAmount) > 0}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setItemDiscountPercent(cleanNumberInput(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Item Discount $</label>
                  <Input type="number" placeholder="0" value={itemDiscountAmount}
                    disabled={Number(itemDiscountPercent) > 0}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setItemDiscountAmount(cleanNumberInput(e.target.value))} />
                </div>
              </div>

              <button onClick={createItem} disabled={loading || !selectedProductId || !quantity}
                className="w-full py-2 text-sm text-white rounded-lg font-bold disabled:opacity-40"
                style={{backgroundColor: "#1B2A5E"}}>
                {loading ? "Adding..." : "➕ Add to Order"}
              </button>
              {result && <p className="text-xs text-center text-gray-600">{result}</p>}
            </div>

            {/* Order Items List */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Order Items</h3>
                <span className="text-xs text-gray-400">{orderItems.length} item{orderItems.length !== 1 ? "s" : ""}</span>
              </div>

              {orderItems.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">No items yet — add a product above</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {orderItems.map((item) => {
                    const isEditing = editingItemId === item.id;
                    const displayGrossLine = Number(item.grossLineTotal || 0) || Number(item.quantity || 0) * Number(item.unitPrice || 0);
                    const itemDiscountCalc = (displayGrossLine * Number(item.itemDiscountPercent || 0) / 100) + Number(item.itemDiscountAmount || 0);
                    const displayNetLine = Math.max(displayGrossLine - itemDiscountCalc, 0);
                    const displayItemDiscount = itemDiscountCalc;
                    const currentEditMargin = isEditing && Number(editingUnitPrice || 0) > 0
                      ? ((Number(editingUnitPrice || 0) - Number(item.unitCostPrice || 0)) / Number(editingUnitPrice || 0)) * 100 : 0;

                    return (
                      <div key={item.id} className="px-6 py-4">
                        {isEditing ? (
                          <div className="space-y-3">
                            <p className="font-semibold text-sm text-gray-900">{item.productName}</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Qty (max: {getEditableMaxQty(item)})</label>
                                <Input type="number" value={editingQuantity} onChange={(e) => setEditingQuantity(e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Unit Price ($)</label>
                                <Input type="number" value={editingUnitPrice}
                                  onChange={(e) => { setEditingUnitPrice(e.target.value); setPriceSource("manual"); }} />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 mb-1 block">Preparation</label>
                              <select value={editingPreparation} onChange={e => setEditingPreparation(e.target.value)}
                                className="w-full rounded-lg border px-3 py-2 text-sm bg-white">
                                <option value="">— None —</option>
                                {prepOptions.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Discount %</label>
                                <Input type="number" value={editingItemDiscountPercent}
                                  onChange={(e) => setEditingItemDiscountPercent(e.target.value)} />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Discount $</label>
                                <Input type="number" value={editingItemDiscountAmount}
                                  onChange={(e) => setEditingItemDiscountAmount(e.target.value)} />
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <button onClick={() => {
                                const ap = getPricing({ product: products.find(p => p.id === item.productId) || null, customer: selectedCustomer, quantity: Number(editingQuantity || item.quantity || 0), isSample: false, ownerAtCost: false }) as Partial<PricingResult>;
                                setEditingUnitPrice(String(Number(ap?.unitPrice || 0))); setPriceSource("auto");
                              }} className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100">Auto Price</button>
                              {selectedCustomer?.specialPrices?.[item.productId] !== undefined && (
                                <button onClick={() => { setEditingUnitPrice(String(selectedCustomer.specialPrices![item.productId])); setPriceSource("vip"); }}
                                  className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100">VIP Price</button>
                              )}
                              <button onClick={() => { setEditingUnitPrice(String(item.unitCostPrice || 0)); setPriceSource("cost"); }}
                                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100">Cost Price</button>
                            </div>
                            <div className="text-xs text-gray-500">
                              Net: {money(editNetLineTotal)} · Margin: <span className={currentEditMargin < 0 ? "text-red-500" : currentEditMargin < 15 ? "text-yellow-600" : "text-green-600"}>{currentEditMargin.toFixed(1)}%</span>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => updateItem(item)}>Save</Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-semibold text-sm text-gray-900">{item.productName}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className={`font-semibold ${Number(item.quantity) % 1 === 0 ? "text-orange-500" : "text-green-600"}`}>
                                  {item.quantity}
                                </span>
                                <span>× {money(item.unitPrice)}</span>
                                {displayItemDiscount > 0 && <span className="text-red-500">-{money(displayItemDiscount)}</span>}
                                {item.preparation && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">🔪 {item.preparation}</span>}
                                {(item as any).sample && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">🧪 Sample</span>}
                                {(item as any).gift && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">🎁 Gift</span>}
                              </div>
                              <div className="mt-0.5 text-xs text-gray-400">
                                Cost: {money(item.unitCostPrice)} · Profit: {money(Math.max(displayNetLine - Number(item.quantity || 0) * Number(item.unitCostPrice || 0), 0))} · Margin: {displayNetLine > 0 ? (((displayNetLine - Number(item.quantity || 0) * Number(item.unitCostPrice || 0)) / displayNetLine) * 100).toFixed(1) : "0.0"}%
                              </div>
                            </div>
                            <div className="text-right space-y-1 shrink-0">
                              <p className="font-bold text-gray-900">{money(displayNetLine)}</p>
                              {weighingItemId === item.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="number" step="0.001" placeholder="kg..." value={weighedQuantity}
                                    onChange={e => setWeighedQuantity(e.target.value)}
                                    className="w-20 border rounded px-2 py-1 text-xs focus:outline-none" autoFocus />
                                  <button onClick={async () => {
                                    if (!weighedQuantity || Number(weighedQuantity) <= 0) return;
                                    const qty = Number(weighedQuantity);
                                    const res = await fetch("https://us-central1-di-peppi.cloudfunctions.net/updateOrderItemCallable", {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ data: { orderItemId: item.id, productId: item.productId, quantity: qty, unitPrice: Number(item.unitPrice || 0), unitCostPrice: Number(item.unitCostPrice || 0), itemDiscountPercent: Number(item.itemDiscountPercent || 0), itemDiscountAmount: Number(item.itemDiscountAmount || 0), grossLineTotal: qty * Number(item.unitPrice || 0), netLineTotal: qty * Number(item.unitPrice || 0), notes: item.notes || "", customerType: selectedCustomer?.customerType || "", sample: false, gift: false } })
                                    });
                                    if (res.ok) {
                                      const newGross = qty * Number(item.unitPrice || 0);
                                      const newDiscount = (newGross * Number(item.itemDiscountPercent || 0) / 100) + Number(item.itemDiscountAmount || 0);
                                      const newNet = Math.max(newGross - newDiscount, 0);
                                      const newProfit = newNet - (qty * Number(item.unitCostPrice || 0));
                                      setOrderItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: qty, totalPrice: newNet, profit: newProfit } : i));
                                      setWeighingItemId(""); setWeighedQuantity("");
                                    }
                                    else alert("Failed to update quantity");
                                  }} className="text-xs px-2 py-1 bg-green-600 text-white rounded">✓</button>
                                  <button onClick={() => { setWeighingItemId(""); setWeighedQuantity(""); }} className="text-xs px-2 py-1 border rounded">✕</button>
                                </div>
                              ) : (
                                <button
                                  className={`text-xs px-2 py-1 rounded border font-semibold ${Number(item.quantity) % 1 === 0 ? "border-orange-400 text-orange-600 bg-orange-50" : "border-green-400 text-green-600 bg-green-50"}`}
                                  onClick={() => { setWeighingItemId(item.id); setWeighedQuantity(String(item.quantity || "")); }}>
                                  ⚖️ Weigh
                                </button>
                              )}
                              <div className="flex gap-1 justify-end">
                                <Button variant="outline" size="icon" onClick={() => startEdit(item)} disabled={isEditing}><Pencil className="h-3 w-3" /></Button>
                                <Button variant="outline" size="icon" onClick={() => deleteItem(item.id)} disabled={deletingItemId === item.id}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Totals */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Order Discount %</label>
                    <Input type="number" placeholder="0" value={discountPercent} disabled={hasDiscountAmount}
                      onFocus={(e) => e.target.select()} onChange={(e) => setDiscountPercent(cleanNumberInput(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Order Discount $</label>
                    <Input type="number" placeholder="0" value={discountAmount} disabled={hasDiscountPercent}
                      onFocus={(e) => e.target.select()} onChange={(e) => setDiscountAmount(cleanNumberInput(e.target.value))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Delivery Fee $</label>
                  <Input type="number" placeholder="0" value={deliveryFee}
                    onFocus={(e) => e.target.select()} onChange={(e) => setDeliveryFee(cleanNumberInput(e.target.value))} />
                </div>
                <div className="space-y-1 pt-2 text-sm border-t border-gray-200">
                  {grossSubtotal !== netSubtotal && <div className="flex justify-between text-gray-500"><span>Gross</span><span>{money(grossSubtotal)}</span></div>}
                  {itemDiscountTotal > 0 && <div className="flex justify-between text-red-500"><span>Item Discounts</span><span>-{money(itemDiscountTotal)}</span></div>}
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{money(netSubtotal)}</span></div>
                  {orderDiscountValue > 0 && <div className="flex justify-between text-red-500"><span>Order Discount</span><span>-{money(orderDiscountValue)}</span></div>}
                  {deliveryFeeNumber > 0 && <div className="flex justify-between text-gray-500"><span>Delivery</span><span>{money(deliveryFeeNumber)}</span></div>}
                  {roundingAdjustment !== 0 && <div className={`flex justify-between ${roundingAdjustment > 0 ? "text-green-600" : "text-red-500"}`}><span>Rounding</span><span>{(roundingAdjustment > 0 ? "+" : "") + money(Math.abs(roundingAdjustment))}</span></div>}
                  <div className="flex justify-between text-green-600 text-xs"><span>Profit</span><span>{money(totalProfit)}</span></div>
                  <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-300">
                    <span>Total</span><span style={{color: "#1B2A5E"}}>{money(finalTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            {editingItem && <div className="hidden">{editingMarginPercent}</div>}

            {/* Create Invoice Button */}
            {orderItems.length > 0 && (
              <button
                className="w-full py-3 text-white font-bold rounded-xl text-sm"
                style={{backgroundColor: "#1B2A5E"}}
                onClick={async () => {
                  try {
                    if (!deliveryDate) { alert("Please set a Delivery Date first."); return; }
                    const selectedOrder = orders.find(o => o.id === selectedOrderId);
                    if (!selectedOrder) { alert("Order not found"); return; }
                    const id = await createDraftInvoice({
                      ...selectedOrder,
                      customerId: selectedCustomer?.id || "",
                      customerName: selectedCustomer?.name || "",
                      customerType: selectedCustomer?.customerType || "",
                      customerPhone: selectedCustomer?.phone || "",
                      customerBuilding: selectedCustomer?.building || "",
                      customerApartment: selectedCustomer?.apartment || "",
                      customerFloor: selectedCustomer?.floor || "",
                      customerCity: selectedCustomer?.city || "",
                      customerCountry: selectedCustomer?.country || "",
                      customerAdditionalInstructions: selectedCustomer?.additionalInstructions || "",
                      customerMapsLink: selectedCustomer?.mapsLink || "",
                      grossTotal: grossSubtotal,
                      netTotal: netSubtotal,
                      discountPercent: discountPercentNumber,
                      discountAmount: orderDiscountValue,
                      deliveryFee: deliveryFeeNumber,
                      finalTotal,
                      rawFinalTotal: Math.max(netSubtotal - orderDiscountValue + deliveryFeeNumber, 0),
                    });
                    await updateDoc(doc(db, "orders", selectedOrderId), { status: "To Deliver" });
                    window.location.href = `/invoices/${id}`;
                  } catch (err) { console.error(err); alert("Error creating invoice"); }
                }}>
                🧾 Create Invoice →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
