"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, Pencil } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPricing } from "@/lib/pricing";

type Product = {
  id: string;
  name: string;
  currentStock: number;
  b2bPrice?: number;
  b2cPrice?: number;
  costPrice?: number;
};

type Order = {
  id: string;
  name: string;
  customerId?: string;
  orderDate?: string;
  status?: string;
  notes?: string;
};

type Customer = {
  id: string;
  name: string;
  deliveryFee?: number;
  customerType?: string;
  clientMargin?: number;
  specialPrices?: Record<string, number>;
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
  return `$${num.toFixed(2)}`;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  const [deletingItemId, setDeletingItemId] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editingQuantity, setEditingQuantity] = useState("");
  const [editingUnitPrice, setEditingUnitPrice] = useState("");
  const [priceSource, setPriceSource] = useState<PriceSource>("auto");

  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState("");
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
      isSample: false,
      ownerAtCost: false,
    }) as Partial<PricingResult> | undefined;

    return {
      unitPrice: Number(value?.unitPrice || 0),
      unitCost: Number(value?.unitCost || selectedProduct?.costPrice || 0),
      label: String(value?.label || "Auto Price"),
      debug: String(value?.debug || ""),
    };
  }, [selectedProduct, selectedCustomer, quantityNumber]);

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
      return sum + Number(item.grossLineTotal || item.totalPrice || 0);
    }, 0);
  }, [orderItems]);

  const netSubtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      return sum + Number(item.netLineTotal || item.totalPrice || 0);
    }, 0);
  }, [orderItems]);

  const itemDiscountTotal = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const grossLine =
        Number(item.grossLineTotal || 0) ||
        Number(item.quantity || 0) * Number(item.unitPrice || 0);
      const netLine =
        Number(item.netLineTotal || 0) || Number(item.totalPrice || 0);
      return sum + Math.max(grossLine - netLine, 0);
    }, 0);
  }, [orderItems]);

  const totalProfit = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + Number(item.profit || 0), 0);
  }, [orderItems]);

  const discountPercentNumber = Number(discountPercent || 0);
  const discountAmountNumber = Number(discountAmount || 0);
  const deliveryFeeNumber = Number(deliveryFee || 0);

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

  const finalTotal = useMemo(() => {
    return Math.max(netSubtotal - orderDiscountValue + deliveryFeeNumber, 0);
  }, [netSubtotal, orderDiscountValue, deliveryFeeNumber]);

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

  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));

      const data: Product[] = snap.docs.map((docSnap) => {
        const raw = docSnap.data();

        return {
          id: docSnap.id,
          name: String(raw.name || "Unnamed Product"),
          currentStock: Number(raw.currentStock || 0),
          costPrice: Number(raw.costPrice || 0),
          b2bPrice: Number(raw.b2bPrice || 0),
          b2cPrice: Number(raw.b2cPrice || 0),
        };
      });

      setProducts(data);
    } catch (error) {
      console.error("Error loading products:", error);
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
        };
      });

      setCustomers(data);
    } catch (error) {
      console.error("Error loading customers:", error);
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
    setOrderStatus("");
    setOrderNotes("");
  };

  const loadOrderTotals = async (orderId: string) => {
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
      setOrderDate(data.orderDate !== undefined ? String(data.orderDate) : "");
      setOrderStatus(data.status !== undefined ? String(data.status) : "");
      setOrderNotes(data.notes !== undefined ? String(data.notes) : "");
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
  }, []);

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
      setResult("");
    }, 3000);

    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (!customerId || !selectedCustomer) return;
    setDeliveryFee(String(Number(selectedCustomer.deliveryFee || 0)));
  }, [customerId, selectedCustomer]);

  useEffect(() => {
    if (!selectedOrderId) return;

    const timer = setTimeout(() => {
      void saveOrderTotals();
    }, 500);

    return () => clearTimeout(timer);
  }, [
    selectedOrderId,
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

    if (finalUnitPrice <= 0) {
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
              sample: false,
              gift: false,
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
              sample: false,
              gift: false,
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <Card className="space-y-6 p-6">
        <div>
          <h1 className="text-xl font-bold">Di Peppi System</h1>
          <p className="text-sm text-gray-500">Order builder and item editor</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">Order</label>
          <select
            className="w-full rounded border p-2"
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
          >
            <option value="">Select Order</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 rounded border p-4">
          <h3 className="text-sm font-semibold">Order Header</h3>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Customer</label>
            <select
              className="w-full rounded border p-2"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Select Customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Order Date</label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Status</label>
            <select
              className="w-full rounded border p-2"
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
            >
              <option value="">Select Status</option>
              <option value="Draft">Draft</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Preparing">Preparing</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">Notes</label>
            <textarea
              className="min-h-[90px] w-full rounded border p-2"
              placeholder="Order notes"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">Product</label>
          <select
            className="w-full rounded border p-2"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">Select Product</option>
            {products.map((product) => (
              <option
                key={product.id}
                value={product.id}
                disabled={product.currentStock <= 0}
              >
                {product.name} ({product.currentStock})
              </option>
            ))}
          </select>
        </div>

        {selectedCustomer && (
          <div className="space-y-1 rounded bg-gray-100 p-3 text-sm">
            <div>Customer Type: {selectedCustomer.customerType || "B2C"}</div>
            <div>Client Margin: {selectedCustomer.clientMargin || 0}</div>
            <div>
              Default Delivery Fee: {money(selectedCustomer.deliveryFee || 0)}
            </div>
          </div>
        )}

        {selectedProduct && (
          <div className="space-y-2 rounded bg-gray-100 p-3 text-sm">
            <div>Available stock: {selectedProduct.currentStock}</div>
            <div>Cost Price: {money(productCardUnitCost)}</div>

            <div>
              {manualPrice ? "Manual Unit Price" : "Calculated Unit Price"}:{" "}
              {money(productCardUnitPrice)}
            </div>

            <div className="text-xs text-gray-500">
              Gross Line Preview: {money(productCardQty * productCardUnitPrice)}
            </div>

            {(itemDiscountPercentNumber > 0 || itemDiscountAmountNumber > 0) && (
              <>
                <div className="text-xs text-red-500">
                  Item Discount Preview: - {money(createTotalItemDiscount)}
                </div>
                <div className="text-xs text-gray-500">
                  Net Line Preview: {money(createNetLineTotal)}
                </div>
              </>
            )}

            <div className="text-xs text-gray-500">
              Profit Preview:{" "}
              {money(
                (createNetLineTotal || 0) - productCardUnitCost * productCardQty
              )}
            </div>

            <div className="text-xs">
              <span
                className={
                  productCardMargin < 0
                    ? "font-semibold text-red-600"
                    : productCardMargin < 15
                    ? "text-yellow-600"
                    : "text-green-600"
                }
              >
                Margin %: {productCardMargin.toFixed(1)}%
              </span>

              {productCardMargin < 0 && (
                <div className="text-xs font-medium text-red-600">
                  ⚠ Selling below cost
                </div>
              )}
            </div>

            <div className="pt-1">
              <PriceSourceBadge
                label={manualPrice ? "Manual Price" : pricing.label}
              />
            </div>

            <div className="text-xs text-gray-500">
              {manualPrice ? "Using manually overridden price" : pricing.debug}
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={manualPrice}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setManualPrice(checked);

                    if (checked) {
                      setManualUnitPrice(String(pricing.unitPrice));
                    } else {
                      setManualUnitPrice("");
                    }
                  }}
                />
                Override Price Manually
              </label>

              {manualPrice && (
                <>
                  <label className="text-xs text-gray-500">Unit Price ($)</label>
                  <Input
                    type="number"
                    placeholder="Enter custom unit price"
                    value={manualUnitPrice}
                    onChange={(e) => setManualUnitPrice(e.target.value)}
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManualUnitPrice(String(pricing.unitPrice))}
                    >
                      Use Auto Price
                    </Button>

                    {selectedCustomer?.specialPrices?.[selectedProduct.id] !==
                      undefined && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setManualUnitPrice(
                            String(
                              selectedCustomer.specialPrices![selectedProduct.id]
                            )
                          )
                        }
                      >
                        Use VIP Price
                      </Button>
                    )}
                  </div>

                  <div className="text-xs text-gray-500">
                    Quick pricing shortcuts
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-gray-600">Quantity</label>
          <Input
            type="number"
            placeholder="Quantity"
            value={quantity}
            max={selectedProduct?.currentStock || undefined}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-600">
              Item Discount %
            </label>
            <Input
              type="number"
              placeholder="0"
              value={itemDiscountPercent}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                setItemDiscountPercent(cleanNumberInput(e.target.value))
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">
              Item Discount $
            </label>
            <Input
              type="number"
              placeholder="0"
              value={itemDiscountAmount}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                setItemDiscountAmount(cleanNumberInput(e.target.value))
              }
            />
          </div>
        </div>

        <Button onClick={createItem} disabled={loading}>
          {loading ? "Creating..." : "Create Order Item"}
        </Button>

        <div className="min-h-[48px] rounded bg-gray-100 p-3 text-sm">
          {result}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-bold">Order Items</h2>

        {!selectedOrderId ? (
          <div className="py-6 text-center text-sm text-gray-400">
            Select an order
          </div>
        ) : orderItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No items in this order yet.
          </div>
        ) : (
          <div className="space-y-3">
            {orderItems.map((item) => {
              const isEditing = editingItemId === item.id;
              const displayGrossLine =
                Number(item.grossLineTotal || 0) ||
                Number(item.quantity || 0) * Number(item.unitPrice || 0);
              const displayNetLine =
                Number(item.netLineTotal || 0) || Number(item.totalPrice || 0);
              const displayItemDiscount = Math.max(
                displayGrossLine - displayNetLine,
                0
              );

              const currentEditMargin =
                isEditing && Number(editingUnitPrice || 0) > 0
                  ? ((Number(editingUnitPrice || 0) -
                      Number(item.unitCostPrice || 0)) /
                      Number(editingUnitPrice || 0)) *
                    100
                  : 0;

              return (
                <div key={item.id} className="rounded border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium">{item.productName}</div>

                      {isEditing ? (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-gray-500">
                              Qty
                            </label>
                            <Input
                              type="number"
                              value={editingQuantity}
                              onChange={(e) => setEditingQuantity(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs text-gray-500">
                              Unit Price ($)
                            </label>
                            <Input
                              type="number"
                              value={editingUnitPrice}
                              onChange={(e) => {
                                setEditingUnitPrice(e.target.value);
                                setPriceSource("manual");
                              }}
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs text-gray-500">
                                Item Discount %
                              </label>
                              <Input
                                type="number"
                                value={editingItemDiscountPercent}
                                onChange={(e) =>
                                  setEditingItemDiscountPercent(e.target.value)
                                }
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-xs text-gray-500">
                                Item Discount $
                              </label>
                              <Input
                                type="number"
                                value={editingItemDiscountAmount}
                                onChange={(e) =>
                                  setEditingItemDiscountAmount(e.target.value)
                                }
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const autoPricing = getPricing({
                                  product:
                                    products.find((p) => p.id === item.productId) ||
                                    null,
                                  customer: selectedCustomer,
                                  quantity: Number(
                                    editingQuantity || item.quantity || 0
                                  ),
                                  isSample: false,
                                  ownerAtCost: false,
                                }) as Partial<PricingResult>;

                                setEditingUnitPrice(
                                  String(Number(autoPricing?.unitPrice || 0))
                                );
                                setPriceSource("auto");
                              }}
                            >
                              Use Auto Price
                            </Button>

                            {selectedCustomer?.specialPrices?.[item.productId] !==
                              undefined && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingUnitPrice(
                                    String(
                                      selectedCustomer.specialPrices![item.productId]
                                    )
                                  );
                                  setPriceSource("vip");
                                }}
                              >
                                Use VIP Price
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingUnitPrice(String(item.unitCostPrice || 0));
                                setPriceSource("cost");
                              }}
                            >
                              Use Cost Price
                            </Button>
                          </div>

                          <div className="text-xs text-gray-500">
                            Max editable quantity: {getEditableMaxQty(item)}
                          </div>

                          <div className="text-xs text-gray-500">
                            Gross line total: {money(editGrossLineTotal)}
                          </div>

                          {(editingItemDiscountPercentNumber > 0 ||
                            editingItemDiscountAmountNumber > 0) && (
                            <>
                              <div className="text-xs text-red-500">
                                Item discount: - {money(editTotalItemDiscount)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Net line total: {money(editNetLineTotal)}
                              </div>
                            </>
                          )}

                          <div className="text-xs text-gray-500">
                            Profit preview:{" "}
                            {money(
                              editNetLineTotal -
                                Number(item.unitCostPrice || 0) *
                                  Number(editingQuantity || 0)
                            )}
                          </div>

                          <div className="text-xs text-gray-500">
                            Margin %: {currentEditMargin.toFixed(1)}%
                          </div>

                          <div className="mt-1 text-xs">
                            {priceSource === "auto" && (
                              <span className="text-blue-500">Auto Price</span>
                            )}
                            {priceSource === "vip" && (
                              <span className="text-green-600">VIP Price</span>
                            )}
                            {priceSource === "cost" && (
                              <span className="text-gray-500">Cost Price</span>
                            )}
                            {priceSource === "manual" && (
                              <span className="text-yellow-600">Manual Price</span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => updateItem(item)}>
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mt-1 text-sm text-gray-500">
                            Qty: {item.quantity} × {money(item.unitPrice)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Gross: {money(displayGrossLine)}
                          </div>
                          {displayItemDiscount > 0 && (
                            <div className="text-xs text-red-500">
                              Discount: - {money(displayItemDiscount)}
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            Cost: {money(item.unitCostPrice)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Profit: {money(item.profit)}
                          </div>
                          {item.notes && (
                            <div className="mt-1 text-xs text-gray-400">
                              {item.notes.replace("UI create | ", "")}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="space-y-2 text-right">
                      <div className="font-medium">{money(displayNetLine)}</div>

                      {!isEditing && (
                        <div className="text-xs text-gray-500">
                          Margin:{" "}
                          {Number(item.unitPrice || 0) > 0
                            ? (
                                ((Number(item.unitPrice || 0) -
                                  Number(item.unitCostPrice || 0)) /
                                  Number(item.unitPrice || 0)) *
                                100
                              ).toFixed(1)
                            : "0.0"}
                          %
                        </div>
                      )}

                      {isEditing && (
                        <div
                          className={`text-xs ${
                            Number(editingUnitPrice || 0) <
                            Number(item.unitCostPrice || 0)
                              ? "font-medium text-red-500"
                              : currentEditMargin < 15
                              ? "text-yellow-600"
                              : "text-green-600"
                          }`}
                        >
                          Editing margin health
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => startEdit(item)}
                          disabled={isEditing}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteItem(item.id)}
                          disabled={deletingItemId === item.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Discount %
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={discountPercent}
                  className="text-gray-900"
                  disabled={hasDiscountAmount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setDiscountPercent(cleanNumberInput(e.target.value))
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-600">
                  Discount $
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={discountAmount}
                  className="text-gray-900"
                  disabled={hasDiscountPercent}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setDiscountAmount(cleanNumberInput(e.target.value))
                  }
                />
              </div>
            </div>

            <div
              className={`text-xs ${
                hasDiscountPercent || hasDiscountAmount
                  ? "text-green-600"
                  : "text-gray-500"
              }`}
            >
              {hasDiscountPercent
                ? "Percentage discount applied"
                : hasDiscountAmount
                ? "Fixed discount applied"
                : "Use either Discount % or Discount $"}
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-600">
                Delivery Fee
              </label>
              <Input
                type="number"
                placeholder="0"
                value={deliveryFee}
                className="text-gray-900"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDeliveryFee(cleanNumberInput(e.target.value))}
              />
            </div>

            <div className="space-y-1 rounded bg-gray-50 p-3 text-sm">
              <SummaryRow label="Gross Subtotal" value={money(grossSubtotal)} />

              {itemDiscountTotal > 0 && (
                <SummaryRow
                  label="Item Discounts"
                  value={`- ${money(itemDiscountTotal)}`}
                  className="text-red-500"
                />
              )}

              <SummaryRow label="Net Subtotal" value={money(netSubtotal)} />

              {discountPercentNumber > 0 && (
                <SummaryRow
                  label={`Order Discount (${discountPercent}%)`}
                  value={`- ${money(orderPercentDiscountValue)}`}
                  className="text-red-500"
                />
              )}

              {discountAmountNumber > 0 && (
                <SummaryRow
                  label="Order Discount ($)"
                  value={`- ${money(discountAmountNumber)}`}
                  className="text-red-500"
                />
              )}

              {deliveryFeeNumber > 0 && (
                <SummaryRow
                  label="Delivery Fee"
                  value={money(deliveryFeeNumber)}
                  className="text-gray-600"
                />
              )}

              <SummaryRow
                label="Total Profit"
                value={money(totalProfit)}
                className="text-green-600"
              />

              <div className="border-t pt-2">
                <SummaryRow
                  label="Final Total"
                  value={money(finalTotal)}
                  className="text-base font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {editingItem && <div className="hidden">{editingMarginPercent}</div>}
      </Card>
    </div>
  );
}
