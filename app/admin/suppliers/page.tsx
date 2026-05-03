"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatQty } from "@/lib/formatters";
import { showToast } from "@/lib/toast";
import SearchInput from "@/components/SearchInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { AlertTriangle } from "lucide-react";

const PAYMENT_TERMS = ["COD", "Consignment", "Net 7", "Net 15", "Net 30", "Net 60", "Prepaid"];
const CURRENCIES = ["EUR", "GBP", "LBP", "USD"];

const titleCase = (s: string) =>
  (s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

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
    if (!name) { showToast("Supplier name is required", "warning"); return; }
    setAdding(true);
    try {
      await onAdd({
        name,
        address: refs.address.current?.value || "",
        phone: "",
        email: "",
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
      className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 p-5">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">New Supplier</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Name *</label>{inp(refs.name, "Supplier name")}</div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Address</label>{inp(refs.address, "Address")}</div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Notes</label>{inp(refs.notes, "Notes")}</div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Google Maps Link</label>{inp(refs.mapsLink, "https://maps.app.goo.gl/...")}</div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Payment Terms</label>
          <SearchableSelect value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS} placeholder="— Select —" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Currency</label>
          <SearchableSelect value={currency} onChange={setCurrency} options={CURRENCIES} placeholder="— Select —" />
        </div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Lead Time (days)</label>{inp(refs.leadTimeDays, "e.g. 3", "number")}</div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Min Order $</label>{inp(refs.minOrder, "0", "number")}</div>
        <div><label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Account #</label>{inp(refs.accountNumber, "Your account ref")}</div>
      </div>
      <p className="text-xs text-orange-500 dark:text-orange-400 mb-4">* Add contacts after creating the supplier</p>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={adding}
          className="px-4 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50">
          {adding ? "Adding..." : "Add Supplier"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Cancel</button>
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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [snap, prodSnap] = await Promise.all([
        getDocs(collection(db, "suppliers")),
        getDocs(collection(db, "products")),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setSuppliers(data.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (s: any) => { setEditing(s.id); setEditData({ ...s }); };
  const cancelEdit = () => { setEditing(null); setEditData({}); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "suppliers", deleteTarget.id));
      setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally { setIsDeleting(false); }
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
    if (!newContact.name.trim()) { showToast("Contact name is required.", "warning"); return; }
    if (!newContact.phone.trim() && !newContact.email.trim()) { showToast("Contact must have a phone number or email address.", "warning"); return; }
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
    if (!contact?.phone && !contact?.email) { showToast("PO Contact must have a phone number or email address.", "warning"); return; }
    const updatedContacts = currentContacts.map(c => ({ ...c, isPrimary: c.id === contactId }));
    await updateDoc(doc(db, "suppliers", supplierId), { contacts: updatedContacts });
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, contacts: updatedContacts } : s));
  };

  const Field = ({ label, value, onChange, type = "text" }: any) => (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">{label}</label>
      <input type={type} defaultValue={value || ""} onBlur={e => onChange(e.target.value)}
        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white dark:bg-gray-700 dark:text-white" />
    </div>
  );

  const filtered = suppliers.filter(s =>
    (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.address || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent dark:border-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <h1 className="text-xl font-bold" style={{color: "#B5535A"}}>Suppliers</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500">{suppliers.length} suppliers</span>
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

        {filtered.map(supplier => {
          const contacts = supplier.contacts || [];
          const contactCount = contacts.length;
          const hasPrimary = contacts.find((c: any) => c.isPrimary);
          const supplierProducts = products.filter(p => p.supplierId === supplier.id || p.supplier === supplier.name);
          const productCount = supplierProducts.length;

          return (
            <div key={supplier.id} className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${supplier.active === false ? "opacity-50" : ""}`}>
              {editing === supplier.id ? (
                <div className="p-5 bg-white dark:bg-gray-800">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <Field label="Name" value={editData.name} onChange={(v: string) => setEditData((p: any) => ({ ...p, name: v }))} />
                    <Field label="Address" value={editData.address} onChange={(v: string) => setEditData((p: any) => ({ ...p, address: v }))} />
                    <Field label="Phone" value={editData.phone} onChange={(v: string) => setEditData((p: any) => ({ ...p, phone: v }))} />
                    <Field label="Email" value={editData.email} onChange={(v: string) => setEditData((p: any) => ({ ...p, email: v }))} type="email" />
                    <Field label="Notes" value={editData.notes} onChange={(v: string) => setEditData((p: any) => ({ ...p, notes: v }))} />
                    <Field label="Google Maps Link" value={editData.mapsLink} onChange={(v: string) => setEditData((p: any) => ({ ...p, mapsLink: v }))} />
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Payment Terms</label>
                      <SearchableSelect value={editData.paymentTerms || ""} onChange={v => setEditData((p: any) => ({ ...p, paymentTerms: v }))} options={PAYMENT_TERMS} placeholder="— Select —" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Currency</label>
                      <SearchableSelect value={editData.currency || "USD"} onChange={v => setEditData((p: any) => ({ ...p, currency: v }))} options={CURRENCIES} placeholder="— Select —" />
                    </div>
                    <Field label="Lead Time (days)" value={editData.leadTimeDays} onChange={(v: string) => setEditData((p: any) => ({ ...p, leadTimeDays: v }))} type="number" />
                    <Field label="Min Order $" value={editData.minOrder} onChange={(v: string) => setEditData((p: any) => ({ ...p, minOrder: v }))} type="number" />
                    <Field label="Account #" value={editData.accountNumber} onChange={(v: string) => setEditData((p: any) => ({ ...p, accountNumber: v }))} />
                    <div className="flex items-center gap-3 pt-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={editData.active !== false}
                          onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                        Active
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => saveSupplier(supplier.id)} disabled={saving === supplier.id}
                      className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50">
                      {saving === supplier.id ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={cancelEdit} className="px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 dark:text-white">{supplier.name || "—"}</p>
                        {supplier.active === false && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>}
                        {supplier.paymentTerms && <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">{supplier.paymentTerms}</span>}
                        {supplier.currency && supplier.currency !== "USD" && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{supplier.currency}</span>}
                        {supplier.leadTimeDays && <span className="text-xs text-gray-400 dark:text-gray-500">🚚 {supplier.leadTimeDays}d</span>}
                        {supplier.accountNumber && <span className="text-xs text-gray-400 dark:text-gray-500">Acc: {supplier.accountNumber}</span>}
                        {hasPrimary && (
                          <span className="text-xs text-green-600 dark:text-green-400">⭐ PO: {hasPrimary.name}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{titleCase(supplier.address || "") || "No address"}</p>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        {supplier.phone && <a href={"https://wa.me/" + supplier.phone.replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">📞 {supplier.phone}</a>}
                        {supplier.email && <a href={"mailto:" + supplier.email} className="text-xs text-blue-500 hover:underline">✉️ {supplier.email}</a>}
                        {supplier.notes && <span className="text-gray-400 dark:text-gray-500 text-xs">{supplier.notes}</span>}
                        {supplier.mapsLink && <a href={supplier.mapsLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-xs">📍 Maps</a>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    {/* Contacts button */}
                    <button onClick={() => {
                      const isOpen = showContactsFor === supplier.id;
                      if (isOpen && contactCount > 0 && !hasPrimary) {
                        showToast("Please add a contact and set a PO Contact before closing.", "warning");
                        return;
                      }
                      setNewContact({ name: "", role: "", phone: "", email: "" });
                      setShowContactsFor(isOpen ? null : supplier.id);
                    }}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        contactCount === 0
                          ? "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          : hasPrimary
                          ? "border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          : "border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      }`}>
                      {contactCount === 0
                        ? "👤 + Add Contact"
                        : `👤 ${contactCount} Contact${contactCount !== 1 ? "s" : ""}${!hasPrimary ? " ⚠️" : ""}`}
                    </button>

                    {/* Products button */}
                    <button onClick={() => setShowProductsFor(showProductsFor === supplier.id ? null : supplier.id)}
                      className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                        productCount === 0
                          ? "border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          : "border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      }`}>
                      {productCount === 0 ? "🦐 No Products" : `🦐 ${productCount} Product${productCount !== 1 ? "s" : ""}`}
                    </button>

                    <button onClick={() => startEdit(supplier)}
                      className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => setDeleteTarget({ id: supplier.id, name: supplier.name })}
                      className="px-3 py-1.5 text-xs border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Contacts Panel */}
              {showContactsFor === supplier.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-900/40">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Contacts — {supplier.name}</p>
                  <div className="space-y-2 mb-4">
                    {contactCount === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No contacts yet.</p>}
                    {contacts.map((c: any) => (
                      <div key={c.id} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${c.isPrimary ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                              {c.isPrimary && <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-medium">⭐ PO Contact</span>}
                            </div>
                            {c.role && <p className="text-xs text-gray-400 dark:text-gray-500">{c.role}</p>}
                          </div>
                          {c.phone && <a href={"https://wa.me/" + c.phone.replace(/[^0-9]/g, "")} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:underline">📞 {c.phone}</a>}
                          {c.email && <a href={"mailto:" + c.email} className="text-xs text-blue-500 hover:underline">✉️ {c.email}</a>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!c.isPrimary && (
                            <button onClick={() => setPrimaryContact(supplier.id, c.id, contacts)}
                              className="text-xs px-2 py-1 rounded font-medium border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                              Set as PO Contact
                            </button>
                          )}
                          <button onClick={() => removeContact(supplier.id, c.id, contacts)}
                            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {(["Name *", "Role", "Phone", "Email"] as const).map((ph, i) => {
                      const key = (["name", "role", "phone", "email"] as const)[i];
                      return (
                        <input key={key} placeholder={ph} value={newContact[key]} onChange={e => setNewContact(p => ({ ...p, [key]: e.target.value }))}
                          className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm focus:outline-none bg-white dark:bg-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500" />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => addContact(supplier.id, contacts)} disabled={addingContact || !newContact.name.trim()}
                      className="px-3 py-1.5 bg-gray-900 dark:bg-white dark:text-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50">
                      {addingContact ? "Adding..." : "+ Add Contact"}
                    </button>
                    {contactCount > 0 && hasPrimary && (
                      <button onClick={() => setShowContactsFor(null)}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
                        ✓ Done
                      </button>
                    )}
                  </div>
                  {contactCount > 0 && !hasPrimary && (
                    <p className="mt-2 text-xs text-red-500 dark:text-red-400 font-medium">⚠️ Please set a PO Contact before closing</p>
                  )}
                </div>
              )}

              {/* Products Panel */}
              {showProductsFor === supplier.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4 bg-gray-50 dark:bg-gray-900/40">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Products from {supplier.name}</p>
                  {supplierProducts.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No products linked yet. Edit a product and select this supplier.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {supplierProducts.map(p => (
                        <span key={p.id} className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded-lg text-gray-700 dark:text-gray-300">
                          {p.name} <span className="text-gray-400 dark:text-gray-500">· {formatQty(p.currentStock)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && !showAdd && (
          <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
            No suppliers found. Click "+ Add Supplier" to add one.
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center mb-4">
              <AlertTriangle className="text-red-500 dark:text-red-400 mb-3" size={32} strokeWidth={2} />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Delete Supplier?</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
              Are you sure you want to delete <span className="font-semibold text-gray-700 dark:text-gray-200">"{deleteTarget.name}"</span>? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                Keep
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
