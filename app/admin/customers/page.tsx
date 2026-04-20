"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatPrice } from "@/lib/formatters";
import { useRouter } from "next/navigation";

const CUSTOMER_TYPES = ["B2B", "B2C", "Owner"];

function Field({ label, value, onChange, type = "text" }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)}
        autoComplete="off" className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
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
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [priceSearch, setPriceSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showPricesFor, setShowPricesFor] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState<any>({ customerType: "", country: "Lebanon" });

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [custSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, "customers")),
        getDocs(collection(db, "products")),
      ]);
      const cdata = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pdata = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomers(cdata.sort((a, b) => {
        // Hold clients always go to the bottom
        if (a.manualHold && !b.manualHold) return 1;
        if (!a.manualHold && b.manualHold) return -1;
        return (a.name || "").localeCompare(b.name || "");
      }));
      setProducts(pdata.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } finally {
      setLoading(false);
    }
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

  const cancelEdit = () => { setEditing(null); setEditData({}); setEditPrices({}); setShowAdd(false); };

  const addCustomer = async () => {
    if (!newCustomer.name?.trim()) { alert("Customer name is required."); return; }
    if (!newCustomer.customerType) { alert("Customer type is required."); return; }
    if (!newCustomer.phoneNumber?.trim()) { alert("Phone number is required."); return; }
    const ref = await addDoc(collection(db, "customers"), {
      ...newCustomer,
      active: true,
      manualHold: false,
      deliveryFee: Number(newCustomer.deliveryFee || 0),
      clientMargin: Number(newCustomer.clientMargin || 0),
      clientDiscount: Number(newCustomer.clientDiscount || 0),
      specialPrices: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const added = { id: ref.id, ...newCustomer, active: true, manualHold: false, specialPrices: {} };
    setCustomers(prev => [...prev, added].sort((a, b) => {
      if (a.manualHold && !b.manualHold) return 1;
      if (!a.manualHold && b.manualHold) return -1;
      return (a.name || "").localeCompare(b.name || "");
    }));
    setNewCustomer({ customerType: "", country: "Lebanon" });
    setShowAdd(false);
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

  const filtered = customers.filter(c => {
    const matchSearch = (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.city || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || c.customerType === filterType;
    return matchSearch && matchType;
  });

  const activeFiltered = filtered.filter(c => !c.manualHold);
  const holdFiltered = filtered.filter(c => c.manualHold);

  const filteredProducts = products.filter(p =>
    (p.name || "").toLowerCase().includes(priceSearch.toLowerCase())
  );



  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          
          <div className="h-4 w-px bg-gray-200" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Customers</h1>
          <span className="text-xs text-gray-400">{customers.length} customers</span>
        </div>
        <div className="flex items-center gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white">
            <option value="all">All Types</option>
            {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={() => { setEditing(null); setEditData({}); setEditPrices({}); setShowAdd(p => !p); }}
            disabled={editing !== null}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            style={{backgroundColor: "#1B2A5E"}}>
            + Add Customer
          </button>
          <button onClick={() => router.push("/admin/customers/import")}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 font-medium text-gray-700">
            ↑ Import CSV
          </button>
          <input type="text" placeholder="Search customers..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 w-48" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-3">
        {showAdd && (
          <div className="bg-white rounded-xl border border-blue-200 p-5">
            <p className="text-sm font-semibold text-gray-900 mb-4">New Customer</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Name *</label>
                <input value={newCustomer.name || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, name: e.target.value }))}
                  placeholder="Customer name" className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 ${!newCustomer.name?.trim() ? "border-red-300" : "border-gray-200"}`} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Company Name</label>
                <input value={newCustomer.companyName || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, companyName: e.target.value }))}
                  placeholder="e.g. ABC Trading SAL" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Customer Type *</label>
                <select value={newCustomer.customerType} onChange={e => setNewCustomer((p: any) => ({ ...p, customerType: e.target.value }))}
                  className={`w-full border rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-900 ${!newCustomer.customerType ? "border-red-300" : "border-gray-200"}`}>
                  <option value="">— Select —</option>
                  {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Phone *</label>
                <input value={newCustomer.phoneNumber || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, phoneNumber: e.target.value }))}
                  placeholder="+961..." className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none ${!newCustomer.phoneNumber?.trim() ? "border-red-300" : "border-gray-200"}`} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">City</label>
                <input value={newCustomer.city || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, city: e.target.value }))}
                  placeholder="Beirut" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Country</label>
                <input value={newCustomer.country || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, country: e.target.value }))}
                  placeholder="Lebanon" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Street</label>
                <input value={newCustomer.street || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, street: e.target.value }))}
                  placeholder="Street" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Building</label>
                <input value={newCustomer.building || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, building: e.target.value }))}
                  placeholder="Building" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Floor</label>
                <input value={newCustomer.floor || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, floor: e.target.value }))}
                  placeholder="Floor" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Apartment</label>
                <input value={newCustomer.apartment || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, apartment: e.target.value }))}
                  placeholder="Apt" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Google Maps Link</label>
                <input value={newCustomer.mapsLink || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, mapsLink: e.target.value }))}
                  placeholder="https://maps.app.goo.gl/..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Delivery Fee $</label>
                <input type="number" value={newCustomer.deliveryFee || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, deliveryFee: e.target.value }))}
                  placeholder="0" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Client Margin %</label>
                <input type="number" value={newCustomer.clientMargin || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, clientMargin: e.target.value }))}
                  placeholder="0" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-0.5">Client Discount %</label>
                <input type="number" value={newCustomer.clientDiscount || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, clientDiscount: e.target.value }))}
                  placeholder="0" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 block mb-0.5">Additional Instructions</label>
                <input value={newCustomer.additionalInstructions || ""} onChange={e => setNewCustomer((p: any) => ({ ...p, additionalInstructions: e.target.value }))}
                  placeholder="Delivery notes..." className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addCustomer}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg"
                style={{backgroundColor: "#1B2A5E"}}>
                Add Customer
              </button>
              <button onClick={() => { setShowAdd(false); setNewCustomer({ customerType: "", country: "Lebanon" }); }}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}
        {filtered.map(customer => {
          const specialCount = Object.keys(customer.specialPrices || {}).length;
          return (
            <div key={customer.id}>
              <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${customer.active === false ? "opacity-50" : ""}`}>
              {editing === customer.id ? (
                <div className="p-5">
                  {/* Basic Info */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Basic Info</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Field label="Name" value={editData.name} onChange={(v: string) => setEditData((p: any) => ({ ...p, name: v }))} />
                    <Field label="Company Name" value={editData.companyName} onChange={(v: string) => setEditData((p: any) => ({ ...p, companyName: v }))} />
                    <div>
                      <label className="text-xs text-gray-500 block mb-0.5">Customer Type</label>
                      <select value={editData.customerType || ""} onChange={e => setEditData((p: any) => ({ ...p, customerType: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none bg-white">
                        {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <Field label="Phone" value={editData.phone} onChange={(v: string) => setEditData((p: any) => ({ ...p, phone: v }))} />
                    <Field label="Delivery Fee $" value={editData.deliveryFee} onChange={(v: string) => setEditData((p: any) => ({ ...p, deliveryFee: v }))} type="number" />
                  </div>

                  {/* Address */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Address</p>
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
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pricing & Settings</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <Field label="Client Margin %" value={editData.clientMargin} onChange={(v: string) => setEditData((p: any) => ({ ...p, clientMargin: v }))} type="number" />
                    <Field label="Client Discount %" value={editData.clientDiscount} onChange={(v: string) => setEditData((p: any) => ({ ...p, clientDiscount: v }))} type="number" />
                    <div className="flex items-center gap-4 pt-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={editData.active !== false} onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                        Active
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={Boolean(editData.manualHold)} onChange={e => setEditData((p: any) => ({ ...p, manualHold: e.target.checked }))} className="w-4 h-4" />
                        Manual Hold
                      </label>
                    </div>
                  </div>

                  {/* Special Prices */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Special Prices</p>
                  <input type="text" placeholder="Search products..." value={priceSearch}
                    onChange={e => setPriceSearch(e.target.value)}
                    className="mb-3 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 w-64" />
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto border border-gray-100 rounded-lg p-3">
                    {filteredProducts.map(product => {
                      const sp = Number(editPrices[product.id] || 0);
                      const cost = Number(product.costPrice || 0);
                      const margin = sp > 0 ? ((sp - cost) / sp) * 100 : null;
                      return (
                        <div key={product.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-700 truncate">{product.name}</p>
                            <p className="text-xs text-gray-400">Selling: ${formatPrice(editData.customerType === "B2B" ? product.b2bPrice : product.b2cPrice || 0)} · Cost: ${formatPrice(cost)}</p>
                          </div>
                          <div className="flex items-center gap-3 justify-end">
                            {margin !== null && (
                              <span className={`text-xs font-semibold w-20 text-left ${margin < 0 ? "text-red-500" : margin < 15 ? "text-yellow-600" : "text-green-600"}`}>
                                {margin < 0 ? "⛔" : margin < 15 ? "⚠️" : "✅"} {margin.toFixed(1)}%
                              </span>
                            )}
                            <input
                              type="number"
                              placeholder="—"
                              value={editPrices[product.id] || ""}
                              onChange={e => setEditPrices(prev => ({ ...prev, [product.id]: e.target.value }))}
                              className={`w-24 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-gray-900 ${editPrices[product.id] ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{Object.values(editPrices).filter(v => v !== "").length} special prices set</p>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t border-gray-100 mt-4">
                    <button onClick={() => saveCustomer(customer.id)} disabled={saving === customer.id}
                      className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                      style={{backgroundColor: "#1B2A5E"}}>
                      {saving === customer.id ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={cancelEdit} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{customer.name || "—"}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            customer.customerType === "B2B" ? "bg-blue-50 text-blue-700" :
                            customer.customerType === "B2C" ? "bg-purple-50 text-purple-700" :
                            "bg-gray-100 text-gray-600"}`}>
                            {customer.customerType || "—"}
                          </span>
                          {customer.manualHold && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">⚠️ Hold</span>}
                          {customer.active === false && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                        </div>
                        {customer.companyName && <p className="text-sm text-gray-500 font-medium mt-0.5">{customer.companyName}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[customer.building, customer.street, customer.city, customer.country].filter(Boolean).join(", ") || "No address"}
                        </p>
                      </div>
                      <div className="hidden md:flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                        {customer.phone && <a href={"https://wa.me/" + String(customer.phone).replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">📞 {customer.phone}</a>}
                        {customer.deliveryFee > 0 && <span>🚚 ${customer.deliveryFee}</span>}
                        {customer.walletBalance > 0 && <span className="text-blue-600 font-medium">💰 Wallet: ${formatPrice(customer.walletBalance)}</span>}
                        {customer.clientMargin > 0 && <span>📊 {customer.clientMargin}% margin</span>}
                        {customer.clientDiscount > 0 && <span>🏷️ {customer.clientDiscount}% disc</span>}
                        {customer.mapsLink && <a href={customer.mapsLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">📍 Maps</a>}
                      </div>
                    </div>
                    <button onClick={() => { setShowAdd(false); startEdit(customer); }} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100 ml-4">Edit</button>
                  </div>

                  {/* Special Prices Toggle Button */}
                  {specialCount > 0 && showPricesFor !== customer.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => setShowPricesFor(customer.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors">
                        🏷️ {specialCount} Special {specialCount === 1 ? "Price" : "Prices"}
                        <span className="transition-transform duration-200">▾</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Special Prices Panel - Outside Card */}
              {specialCount > 0 && showPricesFor === customer.id && (
                <div className="border border-t-0 border-gray-200 rounded-b-xl bg-blue-50 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Special Prices</p>
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
                        <div key={pid} className="flex items-center justify-between rounded-lg px-3 py-2 border border-blue-200 bg-white">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{product?.name || pid}</p>
                              <p className="text-xs text-gray-500">Price: ${formatPrice(sp)} · Cost: ${formatPrice(cost)}</p>
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
    </div>
  );
}
