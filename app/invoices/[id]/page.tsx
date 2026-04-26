"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { createPurchaseOrdersForInvoice } from "@/lib/createPurchaseOrders";
import { formatQty, formatPrice } from "@/lib/formatters";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  customerId: string;
  customerName: string;
  customerType: string;
  currency: string;
  subtotalGross: number;
  itemDiscountTotal: number;
  orderDiscountPercent: number;
  orderDiscountAmount: number;
  subtotalNet: number;
  deliveryFee: number;
  finalTotal: number;
  taxRate?: number;
  taxAmount?: number;
  notes: string;
  sourceOrderName: string;
  orderId: string;
  customerPhone: string;
  roundingAdjustment?: number;
  paidAt?: string;
  paymentMethod?: string;
  customerBuilding: string;
  customerApartment: string;
  customerFloor: string;
  customerCity: string;
  customerCountry: string;
  customerAdditionalInstructions: string;
  customerMapsLink?: string;
  includeDelivery?: boolean;
  canceledAt?: string;
  canceledBy?: string;
}

interface Payment {
  id: string;
  invoiceId: string;
  paymentDate: string;
  amount: number;
  method: string;
  notes: string;
  reference?: string;
  currency: string;
  createdAt: any;
}

interface InvoiceLine {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCostPrice: number;
  itemDiscountPercent: number;
  itemDiscountAmount: number;
  lineGross: number;
  lineNet: number;
  profit: number;
  notes: string;
  sample: boolean;
  gift: boolean;
  preparation?: string;
}

const STATUS_OPTIONS = ["draft", "issued", "paid", "overdue", "cancelled"];

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  draft:     { bg: "bg-gray-100",   text: "text-gray-600",  dot: "bg-gray-400" },
  issued:    { bg: "bg-blue-50",    text: "text-blue-700",  dot: "bg-blue-400" },
  paid:      { bg: "bg-green-50",   text: "text-green-700", dot: "bg-green-500" },
  overdue:   { bg: "bg-red-50",     text: "text-red-700",   dot: "bg-red-500" },
  cancelled: { bg: "bg-orange-50",  text: "text-orange-700",dot: "bg-orange-400" },
};

function money(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val || 0);
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showAddLine, setShowAddLine] = useState(false);
  const [newLineProductId, setNewLineProductId] = useState("");
  const [newLineProductName, setNewLineProductName] = useState("");
  const [newLineProductDropdownOpen, setNewLineProductDropdownOpen] = useState(false);
  const [newLineProductSearch, setNewLineProductSearch] = useState("");
  const [newLineQty, setNewLineQty] = useState("");
  const [newLinePrice, setNewLinePrice] = useState("");
  const [newLineDiscount, setNewLineDiscount] = useState("0");
  const [addingLine, setAddingLine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoicePOs, setInvoicePOs] = useState<any[]>([]);
  const [previewPO, setPreviewPO] = useState<any | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [markingPaid, setMarkingPaid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayMethod, setEditPayMethod] = useState("Cash");
  const [editPayDate, setEditPayDate] = useState("");
  const [editPayNotes, setEditPayNotes] = useState("");
  const [editPayReference, setEditPayReference] = useState("");
  const [savingEditPayment, setSavingEditPayment] = useState(false);
  const [payReference, setPayReference] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [generatingPOs, setGeneratingPOs] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [applyingWallet, setApplyingWallet] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLineQty, setEditLineQty] = useState("");
  const [editLinePrice, setEditLinePrice] = useState("");
  const [editLineDiscount, setEditLineDiscount] = useState("");
  const [savingLine, setSavingLine] = useState(false);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const [taxRate, setTaxRate] = useState<number>(0);

  const [status, setStatus] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!invoiceId) return;
    void loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      const invoiceSnap = await getDoc(doc(db, "invoices", invoiceId));
      if (!invoiceSnap.exists()) {
        alert("Invoice not found");
        router.push("/");
        return;
      }
      const data = { id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice;
      setInvoice(data);
      setStatus(data.status || "draft");
      setDueDate(data.dueDate || "");
      setNotes(data.notes || "");
      setTaxRate(Number(data.taxRate) || 0);
      setIncludeDelivery(data.includeDelivery !== false);

      const linesQuery = query(
        collection(db, "invoiceLines"),
        where("invoiceId", "==", invoiceId)
      );
      const linesSnap = await getDocs(linesQuery);
      const linesData = linesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as InvoiceLine[];
      setLines(linesData);
      // Load products for add line
      const prodSnap = await getDocs(collection(db, "products"));
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((p:any) => p.active !== false));

      // Load payments
      const paymentsQuery = query(
        collection(db, "payments"),
        where("invoiceId", "==", invoiceId),
        orderBy("paymentDate", "asc")
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Payment[];
      setPayments(paymentsData);

      // Load POs for this invoice
      const poSnap = await getDocs(query(
        collection(db, "purchaseOrders"),
        where("invoiceId", "==", invoiceId)
      ));
      setInvoicePOs(poSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load customer wallet balance
      if (data.customerId) {
        const custSnap = await getDoc(doc(db, "customers", data.customerId));
        if (custSnap.exists()) {
          setWalletBalance(Number(custSnap.data().walletBalance || 0));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePDF = async () => {
    if (!invoice) return;
    setGeneratingPDF(true);
    try {
      await generateInvoicePDF(invoice, lines);
    } catch (err) {
      console.error(err);
      alert('Error generating PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!invoice) return;
    setMarkingPaid(true);
    try {
      await updateDoc(doc(db, "invoices", invoiceId), {
        status: "paid",
        paidAt,
        paymentMethod,
        updatedAt: new Date().toISOString(),
      });
      setStatus("paid");
      setInvoice((prev) => prev ? { ...prev, status: "paid", paidAt, paymentMethod } : prev);
      setShowPayModal(false);
    } catch (err) {
      console.error(err);
      alert("Error marking as paid");
    } finally {
      setMarkingPaid(false);
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const balanceDue = (invoice?.finalTotal || 0) - totalPaid;

  const handleAddPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) {
      alert("Enter a valid amount");
      return;
    }
    setSavingPayment(true);
    try {
      const newPayment = {
        invoiceId,
        paymentDate: payDate,
        amount: Number(payAmount),
        method: payMethod,
        notes: payNotes,
        reference: payReference,
        currency: "USD",
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "payments"), newPayment);
      const updatedPayments = [...payments, { id: ref.id, ...newPayment, createdAt: new Date() } as any];
      setPayments(updatedPayments);

      // Update invoice status
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const newBalance = (invoice?.finalTotal || 0) - newTotalPaid;
      let newStatus = invoice?.status || "issued";
      if (newBalance <= 0) newStatus = "paid";
      else if (newTotalPaid > 0) newStatus = "partly paid";

      await updateDoc(doc(db, "invoices", invoiceId), {
        paidAmount: newTotalPaid,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });

      // Credit overpaid amount to customer wallet
      const overpaid = Math.round(Math.max(-newBalance, 0) * 100) / 100;
      if (overpaid > 0 && invoice?.customerId) {
        await updateDoc(doc(db, "customers", invoice.customerId), {
          walletBalance: increment(overpaid),
        });
        await addDoc(collection(db, "walletTransactions"), {
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          amount: overpaid,
          type: "credit",
          description: `Overpayment on ${invoice.invoiceNumber}`,
          createdAt: serverTimestamp(),
        });
        setWalletBalance((prev) => Math.round((prev + overpaid) * 100) / 100);
      }

      setStatus(newStatus);
      setInvoice((prev) => prev ? { ...prev, paidAmount: newTotalPaid, status: newStatus } : prev);
      setShowAddPayment(false);
      setPayAmount("");
      setPayNotes("");
    } catch (err) {
      console.error(err);
      alert("Error saving payment");
    } finally {
      setSavingPayment(false);
    }
  };

  const handlePayFromWallet = async () => {
    if (!invoice?.customerId || walletBalance <= 0 || balanceDue <= 0) return;
    setApplyingWallet(true);
    try {
      const applyAmount = Math.round(Math.min(walletBalance, balanceDue) * 100) / 100;
      const today = new Date().toISOString().slice(0, 10);
      const ref = await addDoc(collection(db, "payments"), {
        invoiceId,
        paymentDate: today,
        amount: applyAmount,
        method: "Wallet",
        notes: "Applied from customer wallet",
        currency: "USD",
        createdAt: serverTimestamp(),
      });
      const updatedPayments = [...payments, { id: ref.id, invoiceId, paymentDate: today, amount: applyAmount, method: "Wallet", notes: "Applied from customer wallet", currency: "USD", createdAt: new Date() } as any];
      setPayments(updatedPayments);

      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const newBalance = (invoice.finalTotal || 0) - newTotalPaid;
      const newStatus = newBalance <= 0 ? "paid" : "partly paid";

      await updateDoc(doc(db, "invoices", invoiceId), {
        paidAmount: newTotalPaid,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, "customers", invoice.customerId), {
        walletBalance: increment(-applyAmount),
      });
      await addDoc(collection(db, "walletTransactions"), {
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: applyAmount,
        type: "debit",
        description: `Applied to ${invoice.invoiceNumber}`,
        createdAt: serverTimestamp(),
      });

      setWalletBalance((prev) => Math.round((prev - applyAmount) * 100) / 100);
      setStatus(newStatus);
      setInvoice((prev) => prev ? { ...prev, paidAmount: newTotalPaid, status: newStatus } : prev);
    } catch (err) {
      console.error(err);
      alert("Error applying wallet credit");
    } finally {
      setApplyingWallet(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Delete this payment? This cannot be undone.")) return;
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "payments", paymentId));
      const updatedPayments = payments.filter(p => p.id !== paymentId);
      setPayments(updatedPayments);
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const newBalance = (invoice?.finalTotal || 0) - newTotalPaid;
      let newStatus = newTotalPaid <= 0 ? "issued" : newBalance <= 0 ? "paid" : "partly_paid";
      await updateDoc(doc(db, "invoices", invoiceId), { paidAmount: newTotalPaid, status: newStatus, updatedAt: new Date().toISOString() });
      setStatus(newStatus);
      setInvoice(prev => prev ? { ...prev, paidAmount: newTotalPaid, status: newStatus } : prev);
    } catch (err) {
      console.error(err);
      alert("Error deleting payment");
    }
  };

  const handleEditPayment = async () => {
    if (!editingPayment || !editPayAmount || Number(editPayAmount) <= 0) return;
    setSavingEditPayment(true);
    try {
      await updateDoc(doc(db, "payments", editingPayment.id), {
        amount: Number(editPayAmount),
        method: editPayMethod,
        paymentDate: editPayDate,
        notes: editPayNotes,
        reference: editPayReference,
      });
      const updatedPayments = payments.map(p => p.id === editingPayment.id ? {
        ...p, amount: Number(editPayAmount), method: editPayMethod,
        paymentDate: editPayDate, notes: editPayNotes, reference: editPayReference
      } : p);
      setPayments(updatedPayments);
      const newTotalPaid = updatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const newBalance = (invoice?.finalTotal || 0) - newTotalPaid;
      let newStatus = newBalance <= 0 ? "paid" : newTotalPaid > 0 ? "partly_paid" : "issued";
      await updateDoc(doc(db, "invoices", invoiceId), { paidAmount: newTotalPaid, status: newStatus, updatedAt: new Date().toISOString() });
      setStatus(newStatus);
      setInvoice(prev => prev ? { ...prev, paidAmount: newTotalPaid, status: newStatus } : prev);
      setEditingPayment(null);
    } catch (err) {
      console.error(err);
      alert("Error updating payment");
    } finally {
      setSavingEditPayment(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!invoice) return;
    let phone = invoice.customerPhone?.replace(/[^0-9]/g, "") || "";
    if (!phone && invoice.customerId) {
      try {
        const custSnap = await getDoc(doc(db, "customers", invoice.customerId));
        if (custSnap.exists()) {
          const p = custSnap.data().phone || custSnap.data().Phone || "";
          phone = String(p).replace(/[^0-9]/g, "");
        }
      } catch (e) {}
    }
    if (!phone) {
      alert("No phone number found for this customer. Please add it in Firestore.");
      return;
    }
    const date = invoice.invoiceDate
      ? invoice.invoiceDate.split("-").reverse().join("/")
      : "";
    const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.finalTotal || 0);
    const link = window.location.href;
    const message = [
      "Hello " + invoice.customerName + ",",
      "",
      "Please find attached your invoice " + invoice.invoiceNumber + " dated " + date + ".",
      "Total amount: " + total,
      "",
      "View or download your invoice here: " + link,
      "",
      "Thank you for your order!",
      "Di Peppi"
    ].join("\n");
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank");
  };

  const handleCancel = async () => {
    if (!invoiceId || !invoice) return;
    setCancelling(true);
    try {
      // 1. Fetch all POs linked to this invoice
      const poSnap = await getDocs(query(
        collection(db, "purchaseOrders"),
        where("invoiceId", "==", invoiceId)
      ));

      const pos = poSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      // 2. Check for Paid POs — block cancellation
      const paidPOs = pos.filter((p: any) => p.status === "Paid");
      if (paidPOs.length > 0) {
        alert(`Cannot cancel — ${paidPOs.length} PO(s) are already Paid. Please resolve them first.`);
        setCancelling(false);
        return;
      }

      // 3. Check for Delivered POs — warn but allow
      const deliveredPOs = pos.filter((p: any) => p.status === "Delivered");
      if (deliveredPOs.length > 0) {
        const proceed = confirm(`⚠️ ${deliveredPOs.length} PO(s) are already Delivered — stock has been received. You will need to manually adjust stock. Proceed with cancellation?`);
        if (!proceed) { setCancelling(false); return; }
      }

      // 4. Handle Sent POs — mark as Cancelled
      const sentPOs = pos.filter((p: any) => p.status === "Sent");
      for (const po of sentPOs) {
        await updateDoc(doc(db, "purchaseOrders", po.id), {
          status: "Cancelled",
          updatedAt: new Date().toISOString(),
        });
      }
      if (sentPOs.length > 0) {
        const suppliers = [...new Set(sentPOs.map((p: any) => `${p.supplierName} (${p.poContactPhone || p.poContactEmail || "no contact"})`))].join(", ");
        alert(`⚠️ ${sentPOs.length} PO(s) were Sent and are now marked Cancelled.
Please call/message the supplier(s): ${suppliers}`);
      }

      // 5. Handle Generated POs — auto-delete with confirmation
      const generatedPOs = pos.filter((p: any) => p.status === "Generated");
      if (generatedPOs.length > 0) {
        const proceed = confirm(`${generatedPOs.length} Generated PO(s) will be deleted. Proceed?`);
        if (proceed) {
          for (const po of generatedPOs) {
            await deleteDoc(doc(db, "purchaseOrders", po.id));
          }
        }
      }

      // 6. Cancel the invoice
      await updateDoc(doc(db, "invoices", invoiceId), {
        status: "cancelled",
        canceledAt: new Date().toISOString(),
        canceledBy: "admin",
        updatedAt: new Date().toISOString(),
      });
      setStatus("cancelled");
      setInvoice(prev => prev ? { ...prev, status: "cancelled" } : prev);
      setShowCancelModal(false);
    } catch (err) {
      console.error(err);
      alert("Error cancelling invoice");
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!confirm("Remove this item from the invoice?")) return;
    await deleteDoc(doc(db, "invoiceLines", lineId));
    const updated = lines.filter(l => l.id !== lineId);
    setLines(updated);
    await recalculateTotalsFromLines(updated);
  };

  const handleSaveLine = async (line: InvoiceLine) => {
    setSavingLine(true);
    try {
      const qty = Number(editLineQty || line.quantity);
      const price = Number(editLinePrice || line.unitPrice);
      const discount = Number(editLineDiscount || line.itemDiscountPercent || 0);
      const isFree = line.sample || line.gift;
      const gross = isFree ? 0 : qty * price;
      const discountAmt = isFree ? 0 : gross * (discount / 100);
      const net = isFree ? 0 : Math.max(gross - discountAmt, 0);
      await updateDoc(doc(db, "invoiceLines", line.id), {
        quantity: qty,
        unitPrice: isFree ? 0 : price,
        itemDiscountPercent: isFree ? 0 : discount,
        lineGross: gross,
        lineNet: net,
        profit: net - (qty * Number(line.unitCostPrice || 0)),
      });
      setLines(prev => prev.map(l => l.id === line.id ? {
        ...l, quantity: qty, unitPrice: isFree ? 0 : price,
        itemDiscountPercent: isFree ? 0 : discount, lineGross: gross, lineNet: net,
      } : l));
      setEditingLineId(null);
      await recalculateTotalsFromLines(lines.map(l => l.id === line.id ? {...l, lineGross: gross, lineNet: net} : l));
    } finally {
      setSavingLine(false);
    }
  };

  const handleSave = async () => {
    if (!invoiceId) return;
    setSaving(true);
    try {
      const cleanTaxRate = Number(taxRate) || 0;
      const taxAmount = Math.round(((invoice?.subtotalNet || 0) * cleanTaxRate / 100) * 100) / 100;
      const deliveryAmount = includeDelivery ? (invoice?.deliveryFee || 0) : 0;
      const finalTotal = (invoice?.subtotalNet || 0) + taxAmount + deliveryAmount;
      await updateDoc(doc(db, "invoices", invoiceId), {
        status,
        dueDate,
        notes,
        taxRate: cleanTaxRate,
        taxAmount,
        finalTotal,
        includeDelivery,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setInvoice((prev) => prev ? { ...prev, status, dueDate, notes, taxRate: cleanTaxRate, taxAmount, finalTotal } : prev);
    } catch (err) {
      console.error(err);
      alert("Error saving changes");
    } finally {
      setSaving(false);
    }
  };

  const recalculateTotalsFromLines = async (currentLines: typeof lines) => {
    try {
      const gross = currentLines.reduce((sum, l) => (l.sample || l.gift) ? sum : sum + Number(l.lineGross || 0), 0);
      const taxAmount = Math.round((gross * taxRate / 100) * 100) / 100;
      const deliveryFee = includeDelivery ? (Number(invoice?.deliveryFee || 0)) : 0;
      const finalTotal = gross + taxAmount + deliveryFee;
      await updateDoc(doc(db, "invoices", invoiceId), {
        subtotalGross: gross,
        subtotalNet: gross,
        taxAmount,
        finalTotal: finalTotal,
        updatedAt: serverTimestamp(),
      });
      setInvoice((prev: any) => prev ? { ...prev, subtotalGross: gross, subtotalNet: gross, taxAmount, finalTotal } : prev);
      } catch(e) {
      console.error("Failed to recalculate", e);
    }
  };

  const handleAddLine = async () => {
    if (!newLineProductId || !newLineQty || !newLinePrice) return;
    setAddingLine(true);
    try {
      const qty = Number(newLineQty);
      const price = Number(newLinePrice);
      const discount = Number(newLineDiscount || 0);
      const net = qty * price * (1 - discount / 100);
      const newLineRef = await addDoc(collection(db, "invoiceLines"), {
        invoiceId: invoiceId,
        productId: newLineProductId,
        productName: newLineProductName,
        quantity: qty,
        unitPrice: price,
        itemDiscountPercent: discount,
        lineGross: net,
        lineNet: net,
        preparation: "",
        sample: false,
        gift: false,
        notes: "",
        createdAt: serverTimestamp(),
      });
      setLines(prev => [...prev, {
        id: newLineRef.id,
        productId: newLineProductId,
        productName: newLineProductName,
        quantity: qty,
        unitPrice: price,
        itemDiscountPercent: discount,
        lineGross: net,
        lineNet: net,
        preparation: "",
        sample: false,
        gift: false,
        notes: "",
      } as any]);
      setShowAddLine(false);
      setNewLineProductId("");
      setNewLineProductName("");
      setNewLineProductDropdownOpen(false);
      setNewLineProductSearch("");
      setNewLineQty("");
      setNewLinePrice("");
      setNewLineDiscount("0");
      await recalculateTotalsFromLines([...lines, { lineGross: net } as any]);
    } catch(e) {
      alert("Failed to add line item");
    } finally {
      setAddingLine(false);
    }
  };

  const handleGeneratePOs = async () => {
    if (!invoice?.orderId) { alert("No order linked to this invoice."); return; }
    if (lines.length === 0) { alert("Add line items to the invoice first."); return; }
    if (invoicePOs.some(p => ["Sent", "Delivered", "Paid"].includes(p.status))) {
      if (!confirm("Some POs have already been sent or delivered. Regenerating will only replace 'Generated' POs. Continue?")) return;
    } else if (!confirm("Generate Purchase Orders from this invoice's line items?")) return;

    setGeneratingPOs(true);
    try {
      // Enrich invoice lines with supplier & cost info from products
      const invoiceItems = await Promise.all(
        lines.map(async (line: any) => {
          let supplierId = "";
          let unitCostPrice = line.unitCostPrice || 0;
          if (line.productId) {
            try {
              const snap = await getDoc(doc(db, "products", line.productId));
              if (snap.exists()) {
                const productData = snap.data();
                supplierId = productData.supplierId || "";
                unitCostPrice = productData.unitCostPrice || 0;
              }
            } catch (e) {
              console.warn("Product not found:", line.productId);
            }
          }
          return {
            ...line,
            supplierId,
            unitCostPrice,
            preparation: line.preparation || "",
            sample: Boolean(line.sample),
            gift: Boolean(line.gift),
          };
        })
      );

      const orderSnap = await getDoc(doc(db, "orders", invoice.orderId));
      const order = orderSnap.exists() ? orderSnap.data() : {};

      // Delete only Generated POs (leave Sent/Delivered/Paid intact)
      const deletable = invoicePOs.filter(p => p.status === "Generated");
      await Promise.all(deletable.map(p => deleteDoc(doc(db, "purchaseOrders", p.id))));

      await createPurchaseOrdersForInvoice({
        orderId: invoice.orderId,
        invoiceId,
        deliveryDate: order.deliveryDate || "",
        orderItems: invoiceItems,
      });

      const poSnap = await getDocs(query(collection(db, "purchaseOrders"), where("invoiceId", "==", invoiceId)));
      const newPOs = poSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setInvoicePOs(newPOs);
      if (newPOs.length === 0) {
        alert("No POs created — make sure products have suppliers assigned in the Products master data.");
      }
    } catch (e: any) {
      alert("Failed to generate POs: " + e.message);
    } finally {
      setGeneratingPOs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.draft;

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          {invoice.orderId && (
            <button onClick={() => router.push(`/admin/orders/${invoice.orderId}`)}
              className="px-4 py-2 text-sm text-white rounded-lg flex items-center gap-1 font-medium hover:opacity-90"
              style={{backgroundColor: "#1B2A5E"}}>
              ← Order
            </button>
          )}
          <h1 className="text-sm font-semibold text-gray-900">
            {invoice.invoiceNumber || "Draft Invoice"}
          </h1>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <button
          onClick={() => setShowAddPayment(true)}
          disabled={balanceDue <= 0 || status === "cancelled"}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {status === "cancelled" ? "Invoice Cancelled" : balanceDue <= 0 ? "✓ Fully Paid" : "Add Payment"}
        </button>
        <button
          onClick={handleWhatsApp}
          disabled={invoice?.status !== "issued"}
          title={invoice?.status !== "issued" ? "Change status to Issued to enable WhatsApp" : ""}
          className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          WhatsApp
        </button>
        {status !== "cancelled" && status !== "paid" && (
          <button
            onClick={() => setShowCancelModal(true)}
            className="px-4 py-2 bg-red-600 border border-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors"
          >
            Cancel Invoice
          </button>
        )}
        <button
          onClick={handlePDF}
          disabled={generatingPDF}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {generatingPDF ? 'Generating...' : 'Download PDF'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || status === "cancelled"}
          className="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style={{
            backgroundColor: status === "cancelled" ? "#9CA3AF" : "#1B2A5E",
          }}
          title={status === "cancelled" ? "Cannot edit cancelled invoice" : ""}
        >
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Invoice</p>
              <h2 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber || "—"}</h2>
              <p className="text-sm text-gray-500 mt-1">Order: {invoice.sourceOrderName || invoice.orderId}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Final Total</p>
              <p className="text-2xl font-bold text-gray-900">{money(invoice.finalTotal)}</p>
              <p className="text-sm text-gray-500 mt-1">{invoice.currency}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Customer</p>
              <p className="text-sm font-medium text-gray-900">{invoice.customerName || "—"}</p>
              <p className="text-xs text-gray-500">{invoice.customerType || "—"}</p>
              {invoice.customerPhone && <a href={"https://wa.me/" + String(invoice.customerPhone).replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline block">📞 {String(invoice.customerPhone).startsWith("+") ? invoice.customerPhone : "+" + invoice.customerPhone}</a>}
              {invoice.customerBuilding && <p className="text-xs text-gray-500">{invoice.customerBuilding}{invoice.customerApartment ? ", Apt " + invoice.customerApartment : ""}</p>}
              {invoice.customerFloor && <p className="text-xs text-gray-500">Floor {invoice.customerFloor}</p>}
              {(invoice.customerCity || invoice.customerCountry) && <p className="text-xs text-gray-500">{[invoice.customerCity, invoice.customerCountry].filter(Boolean).join(", ")}</p>}
              {invoice.customerAdditionalInstructions && <p className="text-xs text-gray-400 italic">{invoice.customerAdditionalInstructions}</p>}
              {invoice.customerMapsLink && <a href={invoice.customerMapsLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">📍 View on Google Maps</a>}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Invoice Date</p>
              <p className="text-sm font-medium text-gray-900">{invoice.invoiceDate || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Due Date</p>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-sm font-medium text-gray-900 border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Status</p>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-sm font-medium text-gray-900 border border-gray-200 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {invoice?.orderId && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Purchase Orders</h3>
              <div className="flex items-center gap-3">
                {status !== "cancelled" && (
                  <button
                    onClick={handleGeneratePOs}
                    disabled={generatingPOs}
                    className="text-xs px-3 py-1.5 text-white rounded-lg font-medium disabled:opacity-50"
                    style={{backgroundColor: "#B5535A"}}>
                    {generatingPOs ? "Generating..." : invoicePOs.length > 0 ? "🔄 Regenerate POs" : "📦 Generate POs"}
                  </button>
                )}
                <a href="/admin/purchase-orders" className="text-xs px-3 py-1.5 text-white rounded-lg font-medium hover:opacity-90 transition-opacity" style={{backgroundColor: "#1B2A5E"}}>
                  View all POs →
                </a>
              </div>
            </div>
            {invoicePOs.length === 0 ? (
              <div className="px-6 py-6 text-center text-sm text-gray-400">
                No purchase orders yet. Click "Generate POs" to create them from order items.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {invoicePOs.map((po: any) => {
                  const statusColors: Record<string, string> = {
                    Generated: "bg-gray-100 text-gray-600",
                    Sent: "bg-blue-50 text-blue-600",
                    Delivered: "bg-green-50 text-green-600",
                    Paid: "bg-purple-50 text-purple-700",
                    Cancelled: "bg-red-50 text-red-500",
                  };
                  return (
                    <div key={po.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-900">{po.poNumber}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[po.status] || "bg-gray-100 text-gray-600"}`}>
                          {po.status}
                        </span>
                        <span className="text-xs text-gray-500">🏭 {po.supplierName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          Delivery: {po.deliveryDate ? po.deliveryDate.split("-").reverse().join("-") : "TBD"}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">${formatPrice(po.poTotal)}</span>
                        <button onClick={() => setPreviewPO(po)}
                          className="text-xs px-2 py-1 rounded-lg text-white font-medium" style={{backgroundColor: "#1B2A5E"}}>
                          Preview
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between w-full">
              <h3 className="text-sm font-semibold text-gray-900">Line Items</h3>
              {invoice?.status === "draft" && (
                <div className="flex gap-2">
<button onClick={() => setShowAddLine(!showAddLine)}
                    className="text-xs px-3 py-1.5 text-white rounded-lg font-medium"
                    style={{backgroundColor: "#1B2A5E"}}>
                    + Add Line
                  </button>
                </div>
              )}
            </div>
          </div>
          {lines.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">No line items found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line) => (
                  <tr key={line.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{line.productName || line.id}</p>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        {line.preparation && <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">🔪 {line.preparation}</span>}
                        {line.sample && <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Sample</span>}
                        {line.gift && <span className="text-xs text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded">Gift</span>}
                        {line.notes && <span className="text-xs text-gray-400">{line.notes}</span>}
                      </div>
                    </td>
                    {editingLineId === line.id ? (
                      <>
                        <td className="px-4 py-3 text-right">
                          <input type="number" value={editLineQty} onChange={e => setEditLineQty(e.target.value)}
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(line.sample || line.gift) ? <span className="text-xs text-gray-400 italic">{line.sample ? "Sample" : "Gift"}</span> :
                          <input type="number" value={editLinePrice} onChange={e => setEditLinePrice(e.target.value)}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(line.sample || line.gift) ? <span className="text-gray-300">—</span> :
                          <input type="number" value={editLineDiscount} onChange={e => setEditLineDiscount(e.target.value)}
                            placeholder="0"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />}
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-medium">
                          {(line.sample || line.gift) ? <span className="text-green-600 font-semibold">$0.00</span> :
                          <span className="text-gray-900">${formatPrice(Number(editLineQty || line.quantity) * Number(editLinePrice || line.unitPrice))}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleSaveLine(line)} disabled={savingLine}
                              className="text-xs px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">
                              {savingLine ? "..." : "Save"}
                            </button>
                            <button onClick={() => setEditingLineId(null)}
                              className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50">✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-4 text-right text-sm text-gray-700">{line.quantity}</td>
                        <td className="px-4 py-4 text-right text-sm text-gray-700">
                          {(line.sample || line.gift) ? <span className="text-xs text-gray-400 italic">{line.sample ? "Sample" : "Gift"}</span> : money(line.unitPrice)}
                        </td>
                        <td className="px-4 py-4 text-right text-sm text-gray-500">
                          {(line.sample || line.gift) ? "—" : line.itemDiscountPercent > 0 ? `-${line.itemDiscountPercent}%` : "—"}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {(line.sample || line.gift) ? <span className="text-green-600 font-semibold">$0.00</span> : money(line.lineGross)}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setEditingLineId(line.id); setEditLineQty(String(line.quantity)); setEditLinePrice(String(line.unitPrice)); setEditLineDiscount(String(line.itemDiscountPercent || 0)); }}
                              className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-100">✏️</button>
                            <button onClick={() => handleDeleteLine(line.id)}
                              className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50">🗑️</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* Add Line Form */}
          {showAddLine && (
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 space-y-3">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">New Line Item</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 relative">
                  <div
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white flex items-center gap-2 cursor-pointer"
                    onClick={() => { setNewLineProductDropdownOpen(o => !o); setNewLineProductSearch(""); }}
                  >
                    {newLineProductId ? (
                      <span className="flex-1 text-gray-900">{products.find((p:any) => p.id === newLineProductId)?.name || "—"}</span>
                    ) : (
                      <span className="flex-1 text-gray-400">Select Product</span>
                    )}
                    {newLineProductId && (
                      <span
                        className="text-gray-400 hover:text-gray-700 text-base leading-none px-0.5"
                        onClick={e => { e.stopPropagation(); setNewLineProductId(""); setNewLineProductName(""); setNewLineProductDropdownOpen(false); setNewLineProductSearch(""); }}
                      >✕</span>
                    )}
                    <span className="text-gray-400 text-xs">{newLineProductDropdownOpen ? "▲" : "▼"}</span>
                  </div>
                  {newLineProductDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => { setNewLineProductDropdownOpen(false); setNewLineProductSearch(""); }} />
                      <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search products..."
                            value={newLineProductSearch}
                            onChange={e => setNewLineProductSearch(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {products
                            .filter((p:any) => (p.name || "").toLowerCase().includes(newLineProductSearch.toLowerCase()))
                            .sort((a:any, b:any) => (a.name || "").localeCompare(b.name || ""))
                            .map((p:any) => (
                              <div
                                key={p.id}
                                onClick={() => {
                                  setNewLineProductId(p.id);
                                  setNewLineProductName(p.name || "");
                                  setNewLinePrice(String(p.b2cPrice || p.b2bPrice || ""));
                                  setNewLineProductDropdownOpen(false);
                                  setNewLineProductSearch("");
                                }}
                                className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 flex items-center justify-between ${p.id === newLineProductId ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"}`}
                              >
                                <span>{p.name}</span>
                                <span className="text-xs text-gray-400 shrink-0 ml-2">{formatQty(p.currentStock)}</span>
                              </div>
                            ))}
                          {products.filter((p:any) => (p.name || "").toLowerCase().includes(newLineProductSearch.toLowerCase())).length === 0 && (
                            <div className="px-4 py-4 text-sm text-gray-400 text-center">No products found</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
                  <input type="number" value={newLineQty} onChange={e => setNewLineQty(e.target.value)}
                    placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Unit Price ($)</label>
                  <input type="number" value={newLinePrice} onChange={e => setNewLinePrice(e.target.value)}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Discount %</label>
                  <input type="number" value={newLineDiscount} onChange={e => setNewLineDiscount(e.target.value)}
                    placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                {newLineQty && newLinePrice && (
                  <div className="flex items-end">
                    <p className="text-sm font-semibold text-gray-900">
                      Total: ${formatPrice(Number(newLineQty) * Number(newLinePrice) * (1 - Number(newLineDiscount || 0) / 100))}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddLine} disabled={addingLine || !newLineProductId || !newLineQty || !newLinePrice}
                  className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
                  style={{backgroundColor: "#1B2A5E"}}>
                  {addingLine ? "Adding..." : "Add Line Item"}
                </button>
                <button onClick={() => setShowAddLine(false)}
                  className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Payments Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-900">Payments</h3>
              {walletBalance > 0 && (
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  💰 Wallet: ${formatPrice(walletBalance)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Balance Due: <span className={balanceDue <= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>${formatPrice(balanceDue)}</span></span>
              {walletBalance > 0 && balanceDue > 0 && (
                <button onClick={handlePayFromWallet} disabled={applyingWallet || status === "cancelled"}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium">
                  {applyingWallet ? "Applying..." : `Use Wallet (${formatPrice(Math.min(walletBalance, balanceDue))})`}
                </button>
              )}
              <button onClick={() => setShowAddPayment(true)} disabled={balanceDue <= 0 || status === "cancelled"} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors font-medium">+ Add Payment</button>
            </div>
          </div>
          {payments.length === 0 ? (
            <div className="px-6 py-6 text-center text-sm text-gray-400">No payments recorded yet</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Ref / Notes</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm text-gray-700">{p.paymentDate}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{p.method}</td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {p.reference && <span className="text-xs font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded mr-1">#{p.reference}</span>}
                      {p.notes || "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-semibold text-green-600">${formatPrice(p.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setEditingPayment(p); setEditPayAmount(String(p.amount)); setEditPayMethod(p.method); setEditPayDate(p.paymentDate); setEditPayNotes(p.notes || ""); setEditPayReference(p.reference || ""); }}
                          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-100">✏️</button>
                        <button onClick={() => handleDeletePayment(p.id)}
                          className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded hover:bg-red-50">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-gray-900">Total Paid</td>
                  <td className="px-6 py-3 text-right text-sm font-bold text-green-600">${formatPrice(totalPaid)}</td>
                </tr>
                {balanceDue < 0 && (
                  <tr className="bg-blue-50">
                    <td colSpan={4} className="px-6 py-3 text-sm font-semibold text-blue-700">💰 Overpaid — credited to wallet</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-blue-600">+${formatPrice(Math.abs(balanceDue))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add notes to this invoice..."
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Gross Subtotal</span>
                <span className="text-gray-900">{money(invoice.subtotalGross)}</span>
              </div>
              {invoice.itemDiscountTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Item Discounts</span>
                  <span className="text-red-600">-{money(invoice.itemDiscountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Net Subtotal</span>
                <span className="text-gray-900">{money(invoice.subtotalNet)}</span>
              </div>
              {invoice.orderDiscountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Order Discount ({invoice.orderDiscountPercent}%)</span>
                  <span className="text-red-600">-{money(invoice.orderDiscountAmount)}</span>
                </div>
              )}
              {invoice.deliveryFee > 0 && (
                <div className="flex justify-between text-sm items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Delivery Fee</span>
                    <button
                      onClick={() => setIncludeDelivery(!includeDelivery)}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${includeDelivery ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-500"}`}
                    >
                      {includeDelivery ? "included" : "excluded"}
                    </button>
                  </div>
                  <span className={includeDelivery ? "text-gray-900" : "text-gray-400 line-through"}>{money(invoice.deliveryFee)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">VAT Rate</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxRate === 0 ? "" : taxRate}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Number(e.target.value);
                      setTaxRate(val);
                    }}
                    placeholder="0"
                    className="w-16 text-right border border-gray-200 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
              </div>
              {taxRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">VAT ({taxRate}%)</span>
                  <span className="text-gray-900">{money((invoice.subtotalNet || 0) * taxRate / 100)}</span>
                </div>
              )}
              {invoice.roundingAdjustment !== 0 && invoice.roundingAdjustment !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Rounding</span>
                  <span className={invoice.roundingAdjustment > 0 ? "text-green-600" : "text-red-500"}>
                    {invoice.roundingAdjustment > 0 ? "+" : ""}{money(invoice.roundingAdjustment)}
                  </span>
                </div>
              )}
              <div className="pt-2.5 mt-2.5 border-t border-gray-200 flex justify-between">
                <span className="text-sm font-semibold text-gray-900">Final Total</span>
                <span className="text-sm font-bold text-gray-900">{money(invoice.finalTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Edit Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Amount (USD)</label>
                <input type="number" value={editPayAmount} onChange={(e) => setEditPayAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Method</label>
                <select value={editPayMethod} onChange={(e) => setEditPayMethod(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Transfer</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Date</label>
                <input type="date" value={editPayDate} onChange={(e) => setEditPayDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Reference #</label>
                <input type="text" value={editPayReference} onChange={(e) => setEditPayReference(e.target.value)}
                  placeholder="Cheque #, Transfer ref..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Notes</label>
                <input type="text" value={editPayNotes} onChange={(e) => setEditPayNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingPayment(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleEditPayment} disabled={savingEditPayment}
                  className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50">
                  {savingEditPayment ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Cancel Invoice</h3>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to cancel <span className="font-semibold">{invoice.invoiceNumber}</span>? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">
                Keep Invoice
              </button>
              <button onClick={handleCancel} disabled={cancelling}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {cancelling ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Add Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Amount (USD)</label>
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Max: ${formatPrice(balanceDue)}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Transfer</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Payment Date</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Reference # (optional)</label>
                <input type="text" value={payReference} onChange={(e) => setPayReference(e.target.value)}
                  placeholder="e.g. Cheque #1234, Transfer ref"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Notes (optional)</label>
                <input type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Additional notes"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddPayment(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleAddPayment} disabled={savingPayment}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {savingPayment ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
    {showPayModal && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Mark as Paid</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option>Cash</option>
                  <option>Card</option>
                  <option>Transfer</option>
                  <option>Cheque</option>
                  <option>Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Payment Date</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowPayModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markingPaid}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {markingPaid ? "Saving..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>

    {/* PO Preview Modal */}
    {previewPO && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-900">{previewPO.poNumber}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">{previewPO.status}</span>
            </div>
            <button onClick={() => setPreviewPO(null)} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <img src="/Di-Peppi-White-Background.jpg" alt="Di Peppi" className="h-12 w-12 object-contain mb-2" />
                <p className="text-xs text-gray-500">Di Peppi — Your Gourmet Companion</p>
                <p className="text-xs text-gray-500">+961 71 521714</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-xs text-gray-500">PO #: <span className="font-semibold text-gray-900">{previewPO.poNumber}</span></p>
                <p className="text-xs text-gray-500">PO Date: {previewPO.poDate ? previewPO.poDate.split("-").reverse().join("-") : "—"}</p>
                <p className="text-xs font-bold" style={{color: "#B5535A"}}>
                  Delivery: {previewPO.deliveryDate ? previewPO.deliveryDate.split("-").reverse().join("-") : "TBD"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-b border-gray-100 py-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Supplier</p>
                <p className="font-semibold text-sm" style={{color: "#B5535A"}}>{previewPO.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contact</p>
                <p className="text-sm text-gray-800">{previewPO.poContactName || "—"}</p>
                {previewPO.poContactPhone && <p className="text-xs text-gray-500">Tel: {previewPO.poContactPhone}</p>}
                {previewPO.poContactEmail && <p className="text-xs text-gray-500">Email: {previewPO.poContactEmail}</p>}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-white" style={{backgroundColor: "#1B2A5E"}}>
                  <th className="text-left px-3 py-2 rounded-tl-lg">Product</th>
                  <th className="text-center px-3 py-2">Qty</th>
                  <th className="text-center px-3 py-2">Unit Cost</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(previewPO.items || []).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                    <td className="px-3 py-2">
                      <div className="text-gray-800">{item.productName || item.productId}</div>
                      {item.preparation && <div className="text-xs text-blue-600">🔪 {item.preparation}</div>}
                      {item.weightNote && <div className="text-xs text-amber-600">⚖️ {item.weightNote}</div>}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-2 text-center text-gray-600">${formatPrice(item.unitCostPrice)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">${formatPrice(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={3} className="px-3 pt-3 text-right font-bold text-gray-700">PO Total:</td>
                  <td className="px-3 pt-3 text-right font-bold text-lg" style={{color: "#1B2A5E"}}>${formatPrice(previewPO.poTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setPreviewPO(null)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
