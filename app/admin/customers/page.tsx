"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { formatPrice } from "@/lib/formatters";
import { useRouter } from "next/navigation";
import SearchInput from "@/components/SearchInput";

const CUSTOMER_TYPES = ["B2B", "B2C", "Blogger", "Owner"];

function Field({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{label}</label>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)}
        autoComplete="off" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white dark:bg-gray-700 dark:text-white" />
    </div>
  );
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [pendingHold, setPendingHold] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [priceSearch, setPriceSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [phonePrefix, setPhonePrefix] = useState("+961");
  const [pricingOpen, setPricingOpen] = useState(false);
  const [showPricesFor, setShowPricesFor] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<any>({ customerType: "", country: "Lebanon" });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "list">(() => {
    try { return (localStorage.getItem("dp-customers-view") as "cards" | "list") || "cards"; } catch { return "cards"; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const newDocInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const custSnap = await getDocs(collection(db, "customers"));
      const cdata = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(cdata.sort((a: any, b: any) => {
        if (a.manualHold && !b.manualHold) return 1;
        if (!a.manualHold && b.manualHold) return -1;
        return (a.name || "").localeCompare(b.name || "");
      }));
      setLoadError(null);
    } catch (err: any) {
      console.error("Failed to load customers:", err);
      setLoadError(err.message || "Failed to load");
    }
    try {
      const prodSnap = await getDocs(collection(db, "products"));
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
    } catch (err) {
      console.warn("Failed to load products:", err);
    }
    setLoading(false);
  };

  const startEdit = (c: any) => {
    setEditing(c.id);
    setEditData({ ...c });
    const prices: Record<string, string> = {};
    if (c.specialPrices) {
      Object.entries(c.specialPrices).forEach(([pid, price]) => {
        prices[pid] = String(price);
      });
    }
    setEditPrices(prices);
    setPriceSearch("");
  };

  const cancelEdit = () => { setEditing(null); setEditData({}); setEditPrices({}); setShowAdd(false); setPendingHold(false); };

  const closeAddDrawer = () => {
    setShowAdd(false);
    setHasAttemptedSubmit(false);
    setPricingOpen(false);
    setNewDocFile(null);
    setNewCustomer({ customerType: "", country: "Lebanon" });
  };

  const addCustomer = async () => {
    setHasAttemptedSubmit(true);
    if (!newCustomer.name?.trim()) return;
    if (!newCustomer.customerType) return;
    if (!newCustomer.phoneNumber?.trim()) return;
    const fullPhone = phonePrefix + (newCustomer.phoneNumber || "").replace(/^\+?[0-9]{1,4}/, "");
    const docRef = await addDoc(collection(db, "customers"), {
      ...newCustomer,
      phoneNumber: fullPhone,
      active: true,
      manualHold: false,
      deliveryFee: Number(newCustomer.deliveryFee || 0),
      clientMargin: Number(newCustomer.clientMargin || 0),
      clientDiscount: Number(newCustomer.clientDiscount || 0),
      specialPrices: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const added: any = { id: docRef.id, ...newCustomer, phoneNumber: fullPhone, active: true, manualHold: false, specialPrices: {} };
    if (newDocFile) {
      await handleDocUpload(newDocFile, docRef.id);
      added.documentUrl = true; // will be refreshed; optimistic placeholder
    }
    setCustomers(prev => [...prev, added].sort((a, b) => {
      if (a.manualHold && !b.manualHold) return 1;
      if (!a.manualHold && b.manualHold) return -1;
      return (a.name || "").localeCompare(b.name || "");
    }));
    closeAddDrawer();
  };

  const saveCustomer = async (id: string) => {
    setSaving(id);
    try {
      const specialPrices: Record<string, number> = {};
      Object.entries(editPrices).forEach(([pid, val]) => {
        if (val !== "" && !isNaN(Number(val))) {
          specialPrices[pid] = Number(val);
        }
      });
      const { id: _, ...data } = editData;
      await updateDoc(doc(db, "customers", id), {
        ...data,
        active: editData.active !== false && editData.active !== undefined ? true : Boolean(editData.active),
        manualHold: Boolean(editData.manualHold),
        deliveryFee: Number(editData.deliveryFee || 0),
        clientMargin: Number(editData.clientMargin || 0),
        clientDiscount: Number(editData.clientDiscount || 0),
        specialPrices,
        updatedAt: new Date().toISOString(),
      });
      setCustomers(prev => prev.map(c => c.id === id ? { ...editData, specialPrices } : c));
      setEditing(null);
    } finally {
      setSaving(null);
    }
  };

  const handleLogoUpload = async (file: File, customerId: string) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `customers/${customerId}/logo/logo.${ext}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "customers", customerId), {
        logoUrl: url,
        logoPath: storagePath,
      });
      setEditData((p: any) => ({ ...p, logoUrl: url }));
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, logoUrl: url } : c));
    } catch (err: any) {
      alert("Logo upload failed: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDocUpload = async (file: File, customerId: string) => {
    setUploadingDoc(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const storagePath = `customers/${customerId}/documents/official.${ext}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "customers", customerId), {
        documentUrl: url,
        documentPath: storagePath,
        documentType: file.type,
        documentMigratedAt: new Date().toISOString(),
      });
      setEditData((p: any) => ({ ...p, documentUrl: url, documentPath: storagePath, documentType: file.type }));
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, documentUrl: url } : c));
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const filtered = customers.filter(c => {
    const matchSearch = (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.city || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || c.customerType === filterType;
    return matchSearch && matchType;
  });

  const activeFiltered = filtered.filter(c => !c.manualHold);
  const holdFiltered = filtered.filter(c => c.manualHold);

  const filteredProducts = products.filter(p => {
    const sellingPrice = Number(p.b2bPrice || p.b2cPrice || 0);
    if (sellingPrice <= 0) return false;
    return (p.name || "").toLowerCase().includes(priceSearch.toLowerCase());
  });

  const b2bCount = customers.filter(c => c.customerType === "B2B").length;
  const b2cCount = customers.filter(c => c.customerType === "B2C").length;

  const setView = (mode: "cards" | "list") => {
    setViewMode(mode);
    try { localStorage.setItem("dp-customers-view", mode); } catch {}
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent dark:border-white rounded-full animate-spin" />
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4">
      <p className="text-red-500 font-medium">⚠️ {loadError}</p>
      <button onClick={() => { setLoadError(null); void load(); }}
        className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg">Retry</button>
      <button onClick={() => router.push("/admin/login")}
        className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600">Re-login</button>
    </div>
  );

  const TypeBadge = ({ type }: { type: string }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
      type === "B2B" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
      type === "B2C" ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
      "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
      {type || "—"}
    </span>
  );

  const Avatar = ({ customer, size }: { customer: any; size: number }) => (
    customer.logoUrl ? (
      <img src={customer.logoUrl} alt={customer.name}
        className={`rounded-lg object-contain border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-0.5 flex-shrink-0`}
        style={{ width: size, height: size }} />
    ) : (
      <div className={`rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0`}
        style={{ width: size, height: size }}>
        <span className="font-bold text-gray-400" style={{ fontSize: size * 0.4 }}>
          {(customer.name || "?").charAt(0).toUpperCase()}
        </span>
      </div>
    )
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Customers</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">{customers.length} customers</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Type tab pills */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {([["all", "All", customers.length], ["B2B", "B2B", b2bCount], ["B2C", "B2C", b2cCount]] as const).map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setFilterType(val)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterType === val
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {label}
                <span className={`text-xs ${filterType === val ? "text-gray-500 dark:text-gray-400" : "text-gray-400 dark:text-gray-500"}`}>{count}</span>
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setView("cards")}
              title="Cards view"
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === "cards" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
            >⊞</button>
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`px-2 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
            >☰</button>
          </div>

          <button onClick={() => { setEditing(null); setEditData({}); setEditPrices({}); setShowAdd(true); }}
            disabled={editing !== null}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{backgroundColor: "#1B2A5E"}}>
            + Add Customer
          </button>
          <button onClick={() => router.push("/admin/customers/import")}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium text-gray-700 dark:text-gray-300">
            ↑ Import CSV
          </button>
          {holdFiltered.length > 0 && (
            <button
              onClick={() => document.getElementById("hold-section")?.scrollIntoView({ behavior: "smooth" })}
              className="px-4 py-2 text-sm border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg font-medium flex items-center gap-1.5">
              ⚠️ On Hold <span className="bg-red-200 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{holdFiltered.length}</span>
            </button>
          )}
          <SearchInput
            placeholder="Search customers..."
            value={search}
            onChange={setSearch}
            className="w-48"
          />
        </div>
      </div>

      {/* ── NEW CUSTOMER DRAWER ── */}
      {showAdd && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40"
            onClick={closeAddDrawer}
          />
          {/* Drawer panel */}
          <div className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <p className="text-base font-semibold text-gray-900 dark:text-white">New Customer</p>
              <button onClick={closeAddDrawer} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* SECTION 1 — Basic Info */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name *</label>
                  <input
                    value={newCustomer.name || ""}
                    onChange={e => setNewCustomer((p: any) => ({ ...p, name: e.target.value }))}
                    placeholder="Customer name"
                    className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 ${hasAttemptedSubmit && !newCustomer.name?.trim() ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-600"}`}
                  />
                  {hasAttemptedSubmit && !newCustomer.name?.trim() && <p className="text-xs text-red-500 mt-0.5">Name is required</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Company Name</label>
                  <input
                    value={newCustomer.companyName || ""}
                    onChange={e => setNewCustomer((p: any) => ({ ...p, companyName: e.target.value }))}
                    placeholder="e.g. ABC Trading SAL"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Customer Type *</label>
                  <select
                    value={newCustomer.customerType}
                    onChange={e => setNewCustomer((p: any) => ({ ...p, customerType: e.target.value }))}
                    className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-gray-900 ${hasAttemptedSubmit && !newCustomer.customerType ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-600"}`}
                  >
                    <option value="">— Select —</option>
                    {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  {hasAttemptedSubmit && !newCustomer.customerType && <p className="text-xs text-red-500 mt-0.5">Type is required</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Phone *</label>
                  <div className={`flex rounded border overflow-hidden ${hasAttemptedSubmit && !newCustomer.phoneNumber?.trim() ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-600"}`}>
                    <select
                      value={phonePrefix}
                      onChange={e => setPhonePrefix(e.target.value)}
                      className="border-r border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm px-2 py-1.5 focus:outline-none flex-shrink-0"
                    >
                      <option value="+961">+961</option>
                      <option value="+971">+971</option>
                      <option value="+966">+966</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                    </select>
                    <input
                      value={newCustomer.phoneNumber || ""}
                      onChange={e => setNewCustomer((p: any) => ({ ...p, phoneNumber: e.target.value }))}
                      placeholder="70 123 456"
                      className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
                    />
                  </div>
                  {hasAttemptedSubmit && !newCustomer.phoneNumber?.trim() && <p className="text-xs text-red-500 mt-0.5">Phone is required</p>}
                </div>
              </div>

              {/* SECTION 2 — Address */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Address</span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">City</label>
                      <input value={newCustomer.city || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, city: e.target.value }))}
                        placeholder="Beirut" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Country</label>
                      <input value={newCustomer.country || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, country: e.target.value }))}
                        placeholder="Lebanon" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Street</label>
                    <input value={newCustomer.street || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, street: e.target.value }))}
                      placeholder="Street" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Building</label>
                      <input value={newCustomer.building || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, building: e.target.value }))}
                        placeholder="Building" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Floor</label>
                      <input value={newCustomer.floor || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, floor: e.target.value }))}
                        placeholder="Floor" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Apt</label>
                      <input value={newCustomer.apartment || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, apartment: e.target.value }))}
                        placeholder="Apt" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Google Maps Link</label>
                    <input value={newCustomer.mapsLink || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, mapsLink: e.target.value }))}
                      placeholder="https://maps.app.goo.gl/..." className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                  </div>
                </div>
              </div>

              {/* SECTION 3 — Pricing & Settings (collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setPricingOpen(p => !p)}
                  className="flex items-center gap-3 w-full text-left mb-3"
                >
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1">
                    Pricing &amp; Settings
                    <span className={`transition-transform duration-200 inline-block ${pricingOpen ? "rotate-180" : ""}`}>▾</span>
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </button>
                {pricingOpen && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Delivery Fee $</label>
                        <input type="number" value={newCustomer.deliveryFee || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, deliveryFee: e.target.value }))}
                          placeholder="0" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Margin %</label>
                        <input type="number" value={newCustomer.clientMargin || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, clientMargin: e.target.value }))}
                          placeholder="0" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Discount %</label>
                        <input type="number" value={newCustomer.clientDiscount || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, clientDiscount: e.target.value }))}
                          placeholder="0" className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Additional Instructions</label>
                      <input value={newCustomer.additionalInstructions || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, additionalInstructions: e.target.value }))}
                        placeholder="Delivery notes..." className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4 — Official Document (B2B only) */}
              {newCustomer.customerType === "B2B" && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Official Document</span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  </div>
                  <input
                    ref={newDocInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic"
                    className="hidden"
                    onChange={e => setNewDocFile(e.target.files?.[0] ?? null)}
                  />
                  {newDocFile ? (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <span className="text-2xl">{newDocFile.type.startsWith("image/") ? "🖼" : "📄"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{newDocFile.name}</p>
                        <p className="text-xs text-gray-400">{(newDocFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button
                        onClick={() => { setNewDocFile(null); if (newDocInputRef.current) newDocInputRef.current.value = ""; }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
                      >✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => newDocInputRef.current?.click()}
                      className="w-full px-3 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-center gap-2 transition-colors"
                    >
                      <span>⬆</span> Upload Document (PDF, JPG, PNG)
                    </button>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Uploaded after customer is created.</p>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={addCustomer}
                className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg"
                style={{backgroundColor: "#1B2A5E"}}
              >
                Add Customer
              </button>
              <button
                onClick={closeAddDrawer}
                className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-3">

        {/* ── LIST VIEW ── */}
        {viewMode === "list" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">City</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(customer => {
                  const isHold = customer.manualHold;
                  return (
                    <tr key={customer.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isHold ? "border-l-4 border-amber-400" : ""} ${customer.active === false ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5">
                        <Avatar customer={customer} size={36} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{customer.name || "—"}</span>
                          <TypeBadge type={customer.customerType} />
                          {isHold && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">⚠️ On Hold</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{customer.companyName || "—"}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{customer.city || "—"}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                        {(customer.phoneNumber || customer.phone) ? (
                          <a href={"https://wa.me/" + String(customer.phoneNumber || customer.phone).replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                            {customer.phoneNumber || customer.phone}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => router.push(`/admin/orders/new?customer=${customer.id}`)}
                            className="px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            + Order
                          </button>
                          <button onClick={() => { setShowAdd(false); startEdit(customer); }}
                            className="px-2.5 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">No customers match your search.</div>
            )}
          </div>
        )}

        {/* ── CARDS VIEW ── */}
        {viewMode === "cards" && [...activeFiltered, ...(holdFiltered.length > 0 ? [{ __divider: true } as any] : []), ...holdFiltered].map((customer, idx) => {
          if (customer.__divider) return (
            <div key="hold-divider" id="hold-section" className="flex items-center gap-3 pt-4">
              <div className="flex-1 h-px bg-red-100" />
              <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">
                ⚠️ On Hold — {holdFiltered.length} {holdFiltered.length === 1 ? "client" : "clients"}
              </span>
              <div className="flex-1 h-px bg-red-100" />
            </div>
          );
          const specialCount = Object.keys(customer.specialPrices || {}).length;
          const isHold = customer.manualHold;
          return (
            <div key={customer.id} className={isHold ? "opacity-70 hover:opacity-100 transition-opacity" : ""}>
              <div className={`bg-white dark:bg-gray-800 rounded-xl overflow-hidden ${isHold ? "border-l-4 border-amber-400 border border-gray-200 dark:border-gray-700" : "border border-gray-200 dark:border-gray-700"} ${customer.active === false ? "opacity-50" : ""}`}>
              {editing === customer.id ? (
                <div className="p-5 bg-white dark:bg-gray-800">
                  {/* Logo */}
                  <div className="flex items-center gap-5 mb-5 pb-5 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative flex-shrink-0">
                      {editData.logoUrl ? (
                        <img src={editData.logoUrl} alt={editData.name}
                          className="w-24 h-24 rounded-xl object-contain border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-1" />
                      ) : (
                        <div className="w-24 h-24 rounded-xl bg-gray-100 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                          <span className="text-3xl font-bold text-gray-300">
                            {(editData.name || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Customer Photo / Logo</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">JPG, PNG, HEIC accepted</p>
                      <input ref={logoInputRef} type="file" accept="image/*,.heic"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f, customer.id); }} />
                      <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                        {uploadingLogo
                          ? <><span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Uploading...</>
                          : <><span>⬆</span> {editData.logoUrl ? "Change Photo" : "Upload Photo"}</>}
                      </button>
                    </div>
                  </div>

                  {/* Basic Info */}
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Basic Info</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Field label="Name" value={editData.name} onChange={(v: string) => setEditData((p: any) => ({ ...p, name: v }))} />
                    <Field label="Company Name" value={editData.companyName} onChange={(v: string) => setEditData((p: any) => ({ ...p, companyName: v }))} />
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Customer Type</label>
                      <select value={editData.customerType || ""} onChange={e => setEditData((p: any) => ({ ...p, customerType: e.target.value }))}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white">
                        {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <Field label="Phone" value={editData.phoneNumber} onChange={(v: string) => setEditData((p: any) => ({ ...p, phoneNumber: v }))} />
                    <Field label="Delivery Fee $" value={editData.deliveryFee} onChange={(v: string) => setEditData((p: any) => ({ ...p, deliveryFee: v }))} type="number" />
                  </div>

                  {/* Address */}
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Address</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Field label="Building" value={editData.building} onChange={(v: string) => setEditData((p: any) => ({ ...p, building: v }))} />
                    <Field label="Apartment" value={editData.apartment} onChange={(v: string) => setEditData((p: any) => ({ ...p, apartment: v }))} />
                    <Field label="Floor" value={editData.floor} onChange={(v: string) => setEditData((p: any) => ({ ...p, floor: v }))} />
                    <Field label="Street" value={editData.street} onChange={(v: string) => setEditData((p: any) => ({ ...p, street: v }))} />
                    <Field label="City" value={editData.city} onChange={(v: string) => setEditData((p: any) => ({ ...p, city: v }))} />
                    <Field label="Country" value={editData.country} onChange={(v: string) => setEditData((p: any) => ({ ...p, country: v }))} />
                    <Field label="Google Maps Link" value={editData.mapsLink} onChange={(v: string) => setEditData((p: any) => ({ ...p, mapsLink: v }))} />
                    <Field label="Additional Instructions" value={editData.additionalInstructions} onChange={(v: string) => setEditData((p: any) => ({ ...p, additionalInstructions: v }))} />
                  </div>

                  {/* Pricing */}
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Pricing & Settings</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Field label="Client Margin %" value={editData.clientMargin} onChange={(v: string) => setEditData((p: any) => ({ ...p, clientMargin: v }))} type="number" />
                    <Field label="Client Discount %" value={editData.clientDiscount} onChange={(v: string) => setEditData((p: any) => ({ ...p, clientDiscount: v }))} type="number" />
                    <div className="flex flex-col gap-2 pt-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox"
                          checked={editData.active !== false && !editData.manualHold}
                          onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked, manualHold: e.target.checked ? false : p.manualHold }))}
                          className="w-4 h-4" />
                        Active
                      </label>
                      <div>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input type="checkbox"
                            checked={Boolean(editData.manualHold)}
                            onChange={e => {
                              if (e.target.checked) {
                                setPendingHold(true);
                              } else {
                                setPendingHold(false);
                                setEditData((p: any) => ({ ...p, manualHold: false, active: p.active }));
                              }
                            }}
                            className="w-4 h-4" />
                          Manual Hold
                        </label>
                        {pendingHold && !editData.manualHold && (
                          <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-300">
                            <p className="mb-2">Put this customer on hold? They won't be able to receive new orders.</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => { setEditData((p: any) => ({ ...p, manualHold: true, active: false })); setPendingHold(false); }}
                                className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700">
                                Confirm
                              </button>
                              <button
                                onClick={() => setPendingHold(false)}
                                className="px-2.5 py-1 border border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400 rounded text-xs hover:bg-amber-100 dark:hover:bg-amber-900/30">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Special Prices */}
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Special Prices</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Set a custom selling price for this customer. Overrides the standard B2B/B2C price.</p>
                  <SearchInput
                    placeholder="Search products..."
                    value={priceSearch}
                    onChange={setPriceSearch}
                    className="mb-3 w-64"
                  />
                  {/* Column header */}
                  <div className="flex items-center gap-2 px-3 mb-1">
                    <span className="flex-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Product</span>
                    <span className="w-20 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider text-left hidden">Margin</span>
                    <span className="w-32 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Special Price (override)</span>
                  </div>
                  <div className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg dark:bg-gray-900/30">
                    {filteredProducts.map(product => {
                      const sp = Number(editPrices[product.id] || 0);
                      const cost = Number(product.costPrice || 0);
                      const margin = sp > 0 ? ((sp - cost) / sp) * 100 : null;
                      const hasOverride = Boolean(editPrices[product.id]);
                      return (
                        <div key={product.id}
                          className={`flex items-center gap-2 px-3 py-2 ${hasOverride ? "border-l-2 border-green-400 bg-green-50/50 dark:bg-green-900/10" : "border-l-2 border-transparent"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{product.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Selling: ${formatPrice(editData.customerType === "B2B" ? product.b2bPrice : product.b2cPrice || 0)} · Cost: ${formatPrice(cost)}</p>
                          </div>
                          <div className="flex items-center gap-3 justify-end">
                            {margin !== null && (
                              <span className={`text-xs font-semibold w-20 text-left ${margin < 0 ? "text-red-500" : margin < 15 ? "text-yellow-600" : "text-green-600"}`}>
                                {margin < 0 ? "⛔" : margin < 15 ? "⚠️" : "✅"} {margin.toFixed(1)}%
                              </span>
                            )}
                            <input
                              type="number"
                              placeholder="e.g. 12.00"
                              value={editPrices[product.id] || ""}
                              onChange={e => setEditPrices(prev => ({ ...prev, [product.id]: e.target.value }))}
                              className={`w-28 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-gray-900 dark:text-white ${editPrices[product.id] ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600" : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 p-3">No products match your search.</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{Object.values(editPrices).filter(v => v !== "").length} special prices set</p>

                  {/* Official Document — B2B only */}
                  {editData.customerType === "B2B" && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Official Document</p>
                      <div className="flex items-center gap-4 flex-wrap">
                        {editData.documentUrl ? (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                            {editData.documentType?.startsWith("image/") ? (
                              <img src={editData.documentUrl} alt="Document" className="w-16 h-16 object-cover rounded cursor-pointer border border-gray-200 dark:border-gray-600"
                                onClick={() => setDocPreview(editData.documentUrl)} />
                            ) : (
                              <div className="w-16 h-16 flex items-center justify-center bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-800 cursor-pointer"
                                onClick={() => window.open(editData.documentUrl, "_blank")}>
                                <span className="text-2xl">📄</span>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Current document</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{editData.documentType || "PDF"}</p>
                              <button onClick={() => window.open(editData.documentUrl, "_blank")}
                                className="text-xs text-blue-600 hover:underline mt-0.5">Open ↗</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No document on file</p>
                        )}
                        <div>
                          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(f, customer.id); }} />
                          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc}
                            className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                            {uploadingDoc
                              ? <><span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Uploading...</>
                              : <><span>⬆</span> {editData.documentUrl ? "Replace Document" : "Upload Document"}</>}
                          </button>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, JPG, PNG accepted</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                    <button onClick={() => saveCustomer(customer.id)} disabled={saving === customer.id}
                      className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                      style={{backgroundColor: "#1B2A5E"}}>
                      {saving === customer.id ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={cancelEdit} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {/* Logo */}
                      {customer.logoUrl ? (
                        <img src={customer.logoUrl} alt={customer.name}
                          className="w-20 h-20 rounded-xl object-contain border border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-700 p-1" />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl font-bold text-gray-400">
                            {(customer.name || "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900 dark:text-white">{customer.name || "—"}</p>
                          <TypeBadge type={customer.customerType} />
                          {isHold && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">⚠️ On Hold</span>}
                          {customer.active === false && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Inactive</span>}
                        </div>
                        {customer.companyName && <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-0.5">{customer.companyName}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[customer.building, customer.street, customer.city, customer.country].filter(Boolean).join(", ") || "No address"}
                        </p>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                        {(customer.phoneNumber || customer.phone) && <a href={"https://wa.me/" + String(customer.phoneNumber || customer.phone).replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">📞 {customer.phoneNumber || customer.phone}</a>}
                        {customer.deliveryFee > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">🚚 Delivery: ${customer.deliveryFee}</span>}
                        {customer.walletBalance > 0 && <span className="text-blue-600 font-medium">💰 Wallet: ${formatPrice(customer.walletBalance)}</span>}
                        {customer.clientMargin > 0 && <span>📊 {customer.clientMargin}% margin</span>}
                        {customer.clientDiscount > 0 && <span>🏷️ {customer.clientDiscount}% disc</span>}
                        {customer.mapsLink && <a href={customer.mapsLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">📍 Maps</a>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => router.push(`/admin/orders/new?customer=${customer.id}`)}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        + Order
                      </button>
                      <button onClick={() => { setShowAdd(false); startEdit(customer); }}
                        className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300">
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* Footer row: special prices + document */}
                  {(specialCount > 0 || customer.documentUrl) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-4 flex-wrap">
                      {specialCount > 0 && showPricesFor !== customer.id && (
                        <button
                          onClick={() => setShowPricesFor(customer.id)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                          🏷️ {specialCount} Special {specialCount === 1 ? "Price" : "Prices"}
                          <span className="transition-transform duration-200">▾</span>
                        </button>
                      )}
                      {customer.documentUrl && customer.customerType === "B2B" && (
                        <button
                          onClick={() => customer.documentType?.startsWith("image/") ? setDocPreview(customer.documentUrl) : window.open(customer.documentUrl, "_blank")}
                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {customer.documentType?.startsWith("image/") ? "🖼" : "📄"} View Document
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Special Prices Panel - Outside Card */}
              {specialCount > 0 && showPricesFor === customer.id && (
                <div className="border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-xl bg-blue-50 dark:bg-blue-900/20 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Special Prices</p>
                    <button
                      onClick={() => setShowPricesFor(null)}
                      className="text-gray-400 hover:text-gray-600">
                      ✕
                    </button>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(customer.specialPrices || {}).map(([pid, price]) => {
                      const product = products.find(p => p.id === pid);
                      const cost = Number(product?.costPrice || 0);
                      const sp = Number(price);
                      const margin = sp > 0 ? ((sp - cost) / sp) * 100 : 0;
                      return (
                        <div key={pid} className="flex items-center justify-between rounded-lg px-3 py-2 border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{product?.name || pid}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Price: ${formatPrice(sp)} · Cost: ${formatPrice(cost)}</p>
                            </div>
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${margin < 0 ? "bg-red-100 text-red-700" : margin < 15 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                            {margin < 0 ? "⛔" : margin < 15 ? "⚠️" : "✅"} {margin.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* Document Lightbox */}
      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDocPreview(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDocPreview(null)}
              className="absolute -top-10 right-0 text-white text-2xl font-bold hover:text-gray-300">✕</button>
            <img src={docPreview} alt="Official Document" className="w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            <div className="flex justify-center mt-3">
              <a href={docPreview} target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 bg-white text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                Open Full Size ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
