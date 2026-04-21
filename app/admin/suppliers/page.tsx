"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatQty } from "@/lib/formatters";
import SearchInput from "@/components/SearchInput";

const PAYMENT_TERMS = ["COD", "Consignment", "Net 7", "Net 15", "Net 30", "Net 60", "Prepaid"];
const CURRENCIES = ["EUR", "GBP", "LBP", "USD"];

function AddSupplierForm({ onAdd, onCancel }: { onAdd: (data: any) => Promise<void>, onCancel: () => void }) {
  const refs = {
    name: useRef<HTMLInputElement>(null),
    address: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    notes: useRef<HTMLInputElement>(null),
    mapsLink: useRef<HTMLInputElement>(null),
    leadTimeDays: useRef<HTMLInputElement>(null),
    minOrder: useRef<HTMLInputElement>(null),
    accountNumber: useRef<HTMLInputElement>(null),
  };
  const [paymentTerms, setPaymentTerms] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const name = refs.name.current?.value.trim() || "";
    const phone = "";
    const email = "";
    if (!name) { alert("Supplier name is required"); return; }
    setAdding(true);
    try {
      await onAdd({
        name,
        address: refs.address.current?.value || "",
        phone,
        email,
        notes: refs.notes.current?.value || "",
        mapsLink: refs.mapsLink.current?.value || "",
        paymentTerms,
        currency,
        leadTimeDays: refs.leadTimeDays.current?.value || "",
        minOrder: refs.minOrder.current?.value || "",
        accountNumber: refs.accountNumber.current?.value || "",
      });
    } finally { setAdding(false); }
  };

  const inp = (ref: any, placeholder: string, type = "text") => (
    <input ref={ref} type={type} placeholder={placeholder}
      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
  );

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5">
      <p className="text-sm font-semibold text-gray-900 mb-4">New Supplier</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
        <div><label className="text-xs text-gray-500 block mb-0.5">Name *</label>{inp(refs.name, "Supplier name")}</div>
        <div><label className="text-xs text-gray-500 block mb-0.5">Address</label>{inp(refs.address, "Address")}</div>

        <div><label className="text-xs text-gray-500 block mb-0.5">Notes</label>{inp(refs.notes, "Notes")}</div>
        <div><label className="text-xs text-gray-500 block mb-0.5">Google Maps Link</label>{inp(refs.mapsLink, "https://maps.app.goo.gl/...")}</div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Payment Terms</label>
          <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none">
            <option value="">— Select —</option>
            {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Currency</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-white focus:outline-none">
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="text-xs text-gray-500 block mb-0.5">Lead Time (days)</label>{inp(refs.leadTimeDays, "e.g. 3", "number")}</div>
        <div><label className="text-xs text-gray-500 block mb-0.5">Min Order $</label>{inp(refs.minOrder, "0", "number")}</div>
        <div><label className="text-xs text-gray-500 block mb-0.5">Account #</label>{inp(refs.accountNumber, "Your account ref")}</div>
      </div>
      <p className="text-xs text-orange-500 mb-4">* Add contacts with a PO Contact after creating the supplier</p>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={adding}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50">
          {adding ? "Adding..." : "Add Supplier"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

export default function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showProductsFor, setShowProductsFor] = useState<string | null>(null);
  const [showContactsFor, setShowContactsFor] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({ name: "", role: "", phone: "", email: "" });
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, prodSnap] = await Promise.all([
        getDocs(collection(db, "suppliers")),
        getDocs(collection(db, "products")),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSuppliers(data.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (s: any) => { setEditing(s.id); setEditData({ ...s }); };
  const cancelEdit = () => { setEditing(null); setEditData({}); };

  const deleteSupplier = async (id: string, name: string) => {
    if (!confirm("Delete supplier " + name + "? This cannot be undone.")) return;
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "suppliers", id));
    setSuppliers(prev => prev.filter(s => s.id !== id));
  };

  const saveSupplier = async (id: string) => {
    setSaving(id);
    try {
      const { id: _, contacts: _c, ...data } = editData;
      await updateDoc(doc(db, "suppliers", id), { ...data, updatedAt: new Date().toISOString() });
      setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...editData } : s));
      setEditing(null);
    } finally { setSaving(null); }
  };

  const addSupplier = async (data: any) => {
    const ref = await addDoc(collection(db, "suppliers"), {
      ...data, active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    setSuppliers(prev => [...prev, { id: ref.id, ...data, active: true }].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAdd(false);
  };

  const addContact = async (supplierId: string, currentContacts: any[]) => {
    if (!newContact.name.trim()) { alert("Contact name is required."); return; }
    if (!newContact.phone.trim() && !newContact.email.trim()) { alert("Contact must have a phone number or email address."); return; }
    setAddingContact(true);
    try {
      const updatedContacts = [...(currentContacts || []), { ...newContact, id: Date.now().toString() }];
      await updateDoc(doc(db, "suppliers", supplierId), { contacts: updatedContacts });
      setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, contacts: updatedContacts } : s));
      setNewContact({ name: "", role: "", phone: "", email: "" });
    } finally { setAddingContact(false); }
  };

  const removeContact = async (supplierId: string, contactId: string, currentContacts: any[]) => {
    const updatedContacts = currentContacts.filter(c => c.id !== contactId);
    await updateDoc(doc(db, "suppliers", supplierId), { contacts: updatedContacts });
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, contacts: updatedContacts } : s));
  };

  const setPrimaryContact = async (supplierId: string, contactId: string, currentContacts: any[]) => {
    const contact = currentContacts.find(c => c.id === contactId);
    if (!contact?.phone && !contact?.email) {
      alert("PO Contact must have a phone number or email address.");
      return;
    }
    const updatedContacts = currentContacts.map(c => ({ ...c, isPrimary: c.id === contactId }));
    await updateDoc(doc(db, "suppliers", supplierId), { contacts: updatedContacts });
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, contacts: updatedContacts } : s));
  };

  const Field = ({ label, value, onChange, type = "text" }: any) => (
    <div>
      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
      <input type={type} defaultValue={value || ""} onBlur={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900" />
    </div>
  );

  const filtered = suppliers.filter(s =>
    (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.address || "").toLowerCase().includes(search.toLowerCase())
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
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Suppliers</h1>
          <span className="text-xs text-gray-400">{suppliers.length} suppliers</span>
        </div>
        <div className="flex items-center gap-3">
          <SearchInput
            placeholder="Search suppliers..."
            value={search}
            onChange={setSearch}
            className="w-48"
          />
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium"
            style={{backgroundColor: "#1B2A5E"}}>
            + Add Supplier
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-3">
        {showAdd && <AddSupplierForm onAdd={addSupplier} onCancel={() => setShowAdd(false)} />}

        {filtered.map(supplier => (
          <div key={supplier.id} className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${supplier.active === false ? "opacity-50" : ""}`}>
            {editing === supplier.id ? (
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <Field label="Name" value={editData.name} onChange={(v: string) => setEditData((p: any) => ({ ...p, name: v }))} />
                  <Field label="Address" value={editData.address} onChange={(v: string) => setEditData((p: any) => ({ ...p, address: v }))} />
                  <Field label="Phone" value={editData.phone} onChange={(v: string) => setEditData((p: any) => ({ ...p, phone: v }))} />
                  <Field label="Email" value={editData.email} onChange={(v: string) => setEditData((p: any) => ({ ...p, email: v }))} type="email" />
                  <Field label="Notes" value={editData.notes} onChange={(v: string) => setEditData((p: any) => ({ ...p, notes: v }))} />
                  <Field label="Google Maps Link" value={editData.mapsLink} onChange={(v: string) => setEditData((p: any) => ({ ...p, mapsLink: v }))} />
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Payment Terms</label>
                    <select value={editData.paymentTerms || ""} onChange={e => setEditData((p: any) => ({ ...p, paymentTerms: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                      <option value="">— Select —</option>
                      {PAYMENT_TERMS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-0.5">Currency</label>
                    <select value={editData.currency || "USD"} onChange={e => setEditData((p: any) => ({ ...p, currency: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm bg-white">
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <Field label="Lead Time (days)" value={editData.leadTimeDays} onChange={(v: string) => setEditData((p: any) => ({ ...p, leadTimeDays: v }))} type="number" />
                  <Field label="Min Order $" value={editData.minOrder} onChange={(v: string) => setEditData((p: any) => ({ ...p, minOrder: v }))} type="number" />
                  <Field label="Account #" value={editData.accountNumber} onChange={(v: string) => setEditData((p: any) => ({ ...p, accountNumber: v }))} />
                  <div className="flex items-center gap-3 pt-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={editData.active !== false}
                        onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                      Active
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button onClick={() => saveSupplier(supplier.id)} disabled={saving === supplier.id}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50">
                    {saving === supplier.id ? "Saving..." : "Save Changes"}
                  </button>
                  <button onClick={cancelEdit} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900">{supplier.name || "—"}</p>
                      {supplier.active === false && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>}
                      {supplier.paymentTerms && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{supplier.paymentTerms}</span>}
                      {supplier.currency && supplier.currency !== "USD" && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{supplier.currency}</span>}
                      {supplier.leadTimeDays && <span className="text-xs text-gray-400">🚚 {supplier.leadTimeDays}d</span>}
                      {supplier.accountNumber && <span className="text-xs text-gray-400">Acc: {supplier.accountNumber}</span>}
                      {(supplier.contacts || []).find((c: any) => c.isPrimary) && (
                        <span className="text-xs text-green-600">⭐ PO: {(supplier.contacts || []).find((c: any) => c.isPrimary)?.name}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{supplier.address || "No address"}</p>
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      {supplier.phone && <a href={"https://wa.me/" + supplier.phone.replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">📞 {supplier.phone}</a>}
                      {supplier.email && <a href={"mailto:" + supplier.email} className="text-xs text-blue-500 hover:underline">✉️ {supplier.email}</a>}
                      {supplier.notes && <span className="text-gray-400 text-xs">{supplier.notes}</span>}
                      {supplier.mapsLink && <a href={supplier.mapsLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">📍 Maps</a>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  <button onClick={() => {
                    const isOpen = showContactsFor === supplier.id;
                    if (isOpen) {
                      const contacts = supplier.contacts || [];
                      if (!contacts.find((c: any) => c.isPrimary)) {
                        alert("Please add a contact and set a PO Contact before closing.");
                        return;
                      }
                    }
                    setNewContact({ name: "", role: "", phone: "", email: "" });
                    setShowContactsFor(isOpen ? null : supplier.id);
                  }}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      !(supplier.contacts || []).find((c: any) => c.isPrimary)
                        ? "border-red-300 text-red-600 hover:bg-red-50"
                        : "border-purple-200 text-purple-600 hover:bg-purple-50"
                    }`}>
                    👤 {(supplier.contacts || []).length > 0 ? `(${supplier.contacts.length})${!(supplier.contacts || []).find((c: any) => c.isPrimary) ? " ⚠️" : ""}` : "⚠️ No Contacts"}
                  </button>
                  <button onClick={() => setShowProductsFor(showProductsFor === supplier.id ? null : supplier.id)}
                    className="px-3 py-1.5 text-xs border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">
                    📦 Products
                  </button>
                  <button onClick={() => startEdit(supplier)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-100">Edit</button>
                  <button onClick={() => deleteSupplier(supplier.id, supplier.name)} className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">Delete</button>
                </div>
              </div>
            )}

            {/* Contacts Panel */}
            {showContactsFor === supplier.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Contacts — {supplier.name}</p>
                <div className="space-y-2 mb-4">
                  {(supplier.contacts || []).length === 0 && <p className="text-xs text-gray-400">No contacts yet.</p>}
                  {(supplier.contacts || []).map((c: any) => (
                    <div key={c.id} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${c.isPrimary ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            {c.isPrimary && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">⭐ PO Contact</span>}
                          </div>
                          {c.role && <p className="text-xs text-gray-400">{c.role}</p>}
                        </div>
                        {c.phone && <a href={"https://wa.me/" + c.phone.replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">📞 {c.phone}</a>}
                        {c.email && <a href={"mailto:" + c.email} className="text-xs text-blue-500 hover:underline">✉️ {c.email}</a>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!c.isPrimary && (
                          <button onClick={() => setPrimaryContact(supplier.id, c.id, supplier.contacts || [])}
                            className="text-xs px-2 py-1 rounded font-medium border border-green-300 text-green-600 hover:bg-green-50">
                            Set as PO Contact
                          </button>
                        )}
                        <button onClick={() => removeContact(supplier.id, c.id, supplier.contacts || [])}
                          className="text-xs text-red-400 hover:text-red-600">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <input placeholder="Name *" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none" />
                  <input placeholder="Role (e.g. Sales)" value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none" />
                  <input placeholder="Phone" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none" />
                  <input placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none" />
                </div>
                <button onClick={() => addContact(supplier.id, supplier.contacts || [])} disabled={addingContact || !newContact.name.trim()}
                  className="mt-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 disabled:opacity-50">
                  {addingContact ? "Adding..." : "+ Add Contact"}
                </button>
                {(supplier.contacts || []).length > 0 && !(supplier.contacts || []).find((c: any) => c.isPrimary) && (
                  <p className="mt-2 text-xs text-red-500 font-medium">⚠️ Please set a PO Contact before closing</p>
                )}
                {(supplier.contacts || []).length > 0 && (supplier.contacts || []).find((c: any) => c.isPrimary) && (
                  <button onClick={() => setShowContactsFor(null)}
                    className="mt-2 ml-2 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
                    ✓ Done
                  </button>
                )}
              </div>
            )}

            {/* Products Panel */}
            {showProductsFor === supplier.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Products from {supplier.name}</p>
                {products.filter(p => p.supplierId === supplier.id || p.supplier === supplier.name).length === 0 ? (
                  <p className="text-xs text-gray-400">No products linked yet. Edit a product and select this supplier.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {products.filter(p => p.supplierId === supplier.id || p.supplier === supplier.name).map(p => (
                      <span key={p.id} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg text-gray-700">
                        {p.name} <span className="text-gray-400">· {formatQty(p.currentStock)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && !showAdd && (
          <div className="text-center py-12 text-sm text-gray-400">
            No suppliers found. Click "+ Add Supplier" to add one.
          </div>
        )}
      </div>
    </div>
  );
}
