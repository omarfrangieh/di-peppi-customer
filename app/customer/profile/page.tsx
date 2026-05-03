"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Map, Plus, Trash2, Pencil, Check, X, ExternalLink } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import LocationPicker from "../components/LocationPicker";
import type { MapLocation, SavedAddress } from "../types";
export type { SavedAddress };

const LABEL_PRESETS = ["Home", "Office", "Family", "Other"];

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  customerType: string; // "B2B" | "B2C"
  companyName: string;
  // structured address (matches admin fields)
  building: string;
  apartment: string;
  floor: string;
  street: string;
  city: string;
  country: string;
  mapsLink: string;
  additionalInstructions: string;
  deliveryInstructions: string;
  addresses: SavedAddress[];
}

/* ─── Single address editor card ─── */
function AddressEditor({
  addr,
  onSave,
  onCancel,
}: {
  addr: Partial<SavedAddress>;
  onSave: (a: SavedAddress) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(addr.label || "Home");
  const [customLabel, setCustomLabel] = useState(
    LABEL_PRESETS.includes(addr.label || "") ? "" : addr.label || ""
  );
  const [address, setAddress] = useState(addr.address || "");
  const [mapLocation, setMapLocation] = useState<MapLocation | null>(addr.mapLocation || null);
  const [showMap, setShowMap] = useState(!!addr.mapLocation);

  const finalLabel = label === "Other" ? customLabel.trim() || "Other" : label;
  const isValid = address.trim() !== "" && finalLabel !== "";

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
      <div>
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Label</p>
        <div className="flex gap-2 flex-wrap">
          {LABEL_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLabel(preset)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer"
              style={
                label === preset
                  ? { backgroundColor: "#1B2A5E", color: "white", borderColor: "#1B2A5E" }
                  : { backgroundColor: "white", color: "#374151", borderColor: "#E5E7EB" }
              }
            >
              {preset}
            </button>
          ))}
        </div>
        {label === "Other" && (
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="e.g. Gym, Parents…"
            className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
          />
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
          Address <span className="text-red-500">*</span>
        </label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Full delivery address"
          rows={2}
          className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none ${!address.trim() ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
            <MapPin size={12} /> Location Pin
            {mapLocation && (
              <span className="text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full normal-case tracking-normal ml-1">✓ Pinned</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowMap(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-all cursor-pointer"
            style={{ color: showMap ? "#1B2A5E" : undefined }}
          >
            <Map size={12} />
            {showMap ? "Hide Map" : "Pin Location"}
          </button>
        </div>
        {showMap && (
          <LocationPicker
            initial={mapLocation}
            height={220}
            onChange={(loc, lbl) => {
              setMapLocation(loc);
              if (!address.trim()) setAddress(lbl);
            }}
          />
        )}
        {!showMap && mapLocation && (
          <p className="text-xs text-gray-400">
            📍 {mapLocation.lat.toFixed(5)}, {mapLocation.lng.toFixed(5)} —{" "}
            <button type="button" onClick={() => setMapLocation(null)} className="text-red-400 hover:text-red-600">Remove</button>
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => isValid && onSave({ id: addr.id || Date.now().toString(), label: finalLabel, address: address.trim(), mapLocation })}
          disabled={!isValid}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-white text-sm font-semibold rounded-lg disabled:bg-gray-200 disabled:cursor-not-allowed cursor-pointer transition-colors"
          style={{ backgroundColor: isValid ? "#1B2A5E" : undefined }}
        >
          <Check size={14} /> Save Address
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function ProfilePage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedMapId, setExpandedMapId] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [mainMapLocation, setMainMapLocation] = useState<MapLocation | null>(null);
  const [showMainMap, setShowMainMap] = useState(true);
  const [mapFlyTo, setMapFlyTo] = useState<MapLocation | null>(null);

  function parseMapsUrl(url: string): MapLocation | null {
    const at = url.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
    if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    const q = url.match(/[?&]q=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
    if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
    const ll = url.match(/[?&]ll=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
    if (ll) return { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };
    return null;
  }

  useEffect(() => {
    const sessionStr = localStorage.getItem("session");
    if (!sessionStr) { router.push("/customer/login"); return; }
    const session = JSON.parse(sessionStr);
    const userId = session.userId;

    getDoc(doc(db, "customers", userId))
      .then((snap) => {
        const d = snap.exists() ? snap.data() : {};

        let addresses: SavedAddress[] = d.addresses || [];
        if (addresses.length === 0 && (d.address || session.address)) {
          addresses = [{
            id: "legacy",
            label: "Home",
            address: d.address || session.address || "",
            mapLocation: d.mapLocation || session.mapLocation || null,
          }];
        }

        const data: Customer = {
          id: userId,
          name: d.name || session.name || session.email || "",
          email: d.email || session.email || "",
          phone: d.phoneNumber || d.phone || session.phone || "",
          customerType: d.customerType || "B2C",
          companyName: d.companyName || "",
          building: d.building || "",
          apartment: d.apartment || "",
          floor: d.floor || "",
          street: d.street || "",
          city: d.city || "",
          country: d.country || "Lebanon",
          mapsLink: d.mapsLink || "",
          additionalInstructions: d.additionalInstructions || "",
          deliveryInstructions: d.deliveryInstructions || "",
          addresses,
        };
        setCustomer(data);
        setFormData(data);
        setMainMapLocation(d.mapLocation || null);
      })
      .catch(() => {
        const data: Customer = {
          id: userId,
          name: session.name || session.email || "",
          email: session.email || "",
          phone: session.phone || "",
          customerType: "B2C",
          companyName: "",
          building: "",
          apartment: "",
          floor: "",
          street: "",
          city: "",
          country: "Lebanon",
          mapsLink: "",
          additionalInstructions: "",
          deliveryInstructions: "",
          addresses: session.address
            ? [{ id: "legacy", label: "Home", address: session.address, mapLocation: session.mapLocation || null }]
            : [],
        };
        setCustomer(data);
        setFormData(data);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const set = (field: keyof Customer, value: string) => {
    if (formData) setFormData({ ...formData, [field]: value });
  };

  const handleAddressSave = (saved: SavedAddress) => {
    if (!formData) return;
    const exists = formData.addresses.find(a => a.id === saved.id);
    const updated = exists
      ? formData.addresses.map(a => a.id === saved.id ? saved : a)
      : [...formData.addresses, saved];
    setFormData({ ...formData, addresses: updated });
    setEditingId(null);
  };

  const handleAddressDelete = (id: string) => {
    if (!formData) return;
    if (formData.addresses.length <= 1) return;
    setFormData({ ...formData, addresses: formData.addresses.filter(a => a.id !== id) });
    if (editingId === id) setEditingId(null);
  };

  const isValid = formData ? formData.phone.trim() !== "" : false;

  const handleSave = async () => {
    if (!formData || !isValid) { setError("Phone number is required."); return; }
    setSaving(true); setError(null); setSuccess(null);
    try {
      await updateDoc(doc(db, "customers", formData.id), {
        name: formData.name,
        phone: formData.phone,
        phoneNumber: formData.phone,
        companyName: formData.companyName || "",
        building: formData.building || "",
        apartment: formData.apartment || "",
        floor: formData.floor || "",
        street: formData.street || "",
        city: formData.city || "",
        country: formData.country || "Lebanon",
        mapsLink: formData.mapsLink || "",
        additionalInstructions: formData.additionalInstructions || "",
        deliveryInstructions: formData.deliveryInstructions || "",
        addresses: formData.addresses,
        // backward compat legacy fields
        address: formData.addresses[0]?.address || "",
        mapLocation: mainMapLocation || formData.addresses[0]?.mapLocation || null,
      });

      const sessionStr = localStorage.getItem("session");
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        localStorage.setItem("session", JSON.stringify({
          ...session,
          name: formData.name,
          phone: formData.phone,
          city: formData.city,
          address: formData.addresses[0]?.address || "",
          mapLocation: formData.addresses[0]?.mapLocation || null,
        }));
      }

      setCustomer(formData);
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(null), 3000);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#1B2A5E", borderTopColor: "transparent" }} />
    </div>
  );

  if (!customer || !formData) return null;

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ color: "#B5535A", fontFamily: "var(--font-playfair)" }}>Profile Settings</h1>
            <p className="text-xs text-gray-400 mt-0.5">Manage your account details</p>
          </div>
          <button
            onClick={() => router.push("/customer/products")}
            className="px-3 py-1.5 text-white text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: "#1B2A5E" }}
          >
            Shop
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-green-700 font-medium text-sm">✓ {success}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-medium text-sm">{error}</p>
          </div>
        )}

        {/* ── Personal Information ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Personal Information</h2>

          <div className={`grid gap-4 ${formData.customerType === "B2B" ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Full Name</label>
              <input type="text" value={formData.name} onChange={e => set("name", e.target.value)} className={inputCls} />
            </div>
            {formData.customerType === "B2B" && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Company Name</label>
                <input type="text" value={formData.companyName} onChange={e => set("companyName", e.target.value)}
                  placeholder="Company name" className={inputCls} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
              <input type="email" value={formData.email} disabled
                className="w-full px-3 py-2.5 border border-gray-100 rounded-xl text-sm text-gray-400 bg-gray-50" />
              <p className="text-xs text-gray-400 mt-1">Cannot be changed</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                Phone <span className="text-red-500">*</span>
              </label>
              <input type="tel" value={formData.phone} onChange={e => set("phone", e.target.value)}
                placeholder="+961 XX XXX XXX"
                className={`w-full px-3 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 ${!formData.phone.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`} />
              {!formData.phone.trim() && <p className="text-xs text-red-500 mt-1">Required</p>}
            </div>
          </div>
        </div>

        {/* ── Address ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Address</h2>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Building</label>
              <input type="text" value={formData.building} onChange={e => set("building", e.target.value)}
                placeholder="Building name" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Floor</label>
              <input type="text" value={formData.floor} onChange={e => set("floor", e.target.value)}
                placeholder="e.g. 3" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Apt</label>
              <input type="text" value={formData.apartment} onChange={e => set("apartment", e.target.value)}
                placeholder="Apt #" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Street</label>
            <input type="text" value={formData.street} onChange={e => set("street", e.target.value)}
              placeholder="Street name" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">City</label>
              <input type="text" value={formData.city} onChange={e => set("city", e.target.value)}
                placeholder="Beirut" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Country</label>
              <input type="text" value={formData.country} onChange={e => set("country", e.target.value)}
                placeholder="Lebanon" className={inputCls} />
            </div>
          </div>

          {/* Location — map pin + paste link */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin size={11} /> Location
                {mainMapLocation && (
                  <span className="text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full normal-case tracking-normal ml-1">✓ Pinned</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowMainMap(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-all cursor-pointer"
                style={{ color: showMainMap ? "#1B2A5E" : undefined }}
              >
                <Map size={12} />
                {showMainMap ? "Hide Map" : "Pin on Map"}
              </button>
            </div>
            {showMainMap && (
              <LocationPicker
                initial={mainMapLocation}
                flyTo={mapFlyTo}
                height={220}
                onChange={(loc) => { setMainMapLocation(loc); setMapFlyTo(null); }}
              />
            )}
            {!showMainMap && mainMapLocation && (
              <p className="text-xs text-gray-400 mb-2">
                📍 {mainMapLocation.lat.toFixed(5)}, {mainMapLocation.lng.toFixed(5)} —{" "}
                <button type="button" onClick={() => setMainMapLocation(null)} className="text-red-400 hover:text-red-600">Remove</button>
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <input type="url" value={formData.mapsLink} onChange={e => {
                  set("mapsLink", e.target.value);
                  const coords = parseMapsUrl(e.target.value);
                  if (coords) { setMapFlyTo(coords); setMainMapLocation(coords); }
                }}
                placeholder="Or paste a Google Maps link — https://maps.app.goo.gl/..."
                className={`${inputCls} flex-1`} />
              {formData.mapsLink && (
                <a href={formData.mapsLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-2.5 border border-gray-200 rounded-xl text-xs text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0">
                  <ExternalLink size={13} /> Open
                </a>
              )}
            </div>
            {formData.mapsLink && !parseMapsUrl(formData.mapsLink) && (
              <p className="text-xs text-amber-600 mt-1">⚠️ Short link detected — coordinates can't be auto-read. Tap on the map above to pin your exact location.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Additional Instructions</label>
            <input type="text" value={formData.additionalInstructions} onChange={e => set("additionalInstructions", e.target.value)}
              placeholder="e.g. Ring bell twice, leave at side gate…" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Delivery Instructions</label>
            <textarea value={formData.deliveryInstructions} onChange={e => set("deliveryInstructions", e.target.value)}
              placeholder="Any specific delivery notes for our team…"
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-gray-400 resize-none" />
          </div>
        </div>

        {/* ── Saved Addresses ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Saved Addresses</h2>
              <p className="text-xs text-gray-400 mt-0.5">Multiple delivery locations with map pins</p>
            </div>
            {editingId !== "new" && (
              <button
                onClick={() => setEditingId("new")}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                style={{ color: "#1B2A5E" }}
              >
                <Plus size={12} /> Add Address
              </button>
            )}
          </div>

          {formData.addresses.map((addr, idx) => (
            <div key={addr.id}>
              {editingId === addr.id ? (
                <AddressEditor addr={addr} onSave={handleAddressSave} onCancel={() => setEditingId(null)} />
              ) : (
                <div className="flex items-start gap-3 p-4 border border-gray-100 rounded-xl bg-gray-50 group">
                  <span className="px-2.5 py-1 text-xs font-bold rounded-lg shrink-0 mt-0.5"
                    style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>
                    {addr.label}
                    {idx === 0 && <span className="ml-1 text-gray-400 font-normal">· default</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 font-medium">{addr.address}</p>
                    {addr.mapLocation ? (
                      <button
                        type="button"
                        onClick={() => setExpandedMapId(expandedMapId === addr.id ? null : addr.id)}
                        className="text-xs text-gray-400 hover:text-gray-600 mt-0.5 flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin size={10} />
                        {expandedMapId === addr.id ? "Hide map" : "View pin"}
                      </button>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">No pin saved</p>
                    )}
                    {expandedMapId === addr.id && addr.mapLocation && (
                      <div className="mt-2">
                        <LocationPicker initial={addr.mapLocation} readOnly height={180} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditingId(addr.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-white transition-all cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleAddressDelete(addr.id)}
                      disabled={formData.addresses.length <= 1}
                      title={formData.addresses.length <= 1 ? "Must keep at least one address" : "Delete"}
                      className="p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-gray-400 hover:text-red-500 hover:bg-white"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {formData.addresses.length === 0 && editingId !== "new" && (
            <p className="text-sm text-gray-400 text-center py-4">No saved addresses yet.</p>
          )}

          {editingId === "new" && (
            <AddressEditor addr={{}} onSave={handleAddressSave} onCancel={() => setEditingId(null)} />
          )}
        </div>

        {/* ── Save / Cancel ── */}
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving || !isValid}
            className="flex-1 py-3 text-white font-bold rounded-xl text-sm transition-colors disabled:bg-gray-200 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
            style={{ backgroundColor: saving || !isValid ? undefined : "#1B2A5E" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={() => {
              setFormData(JSON.parse(JSON.stringify(customer)));
              setEditingId(null);
              setExpandedMapId(null);
            }}
            className="flex-1 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer">
            Cancel
          </button>
        </div>

        {/* ── Account ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide mb-4">Account</h2>
          <div className="flex justify-between items-center py-3 border-b border-gray-100 mb-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</p>
              <p className="text-sm text-gray-700 mt-0.5">{customer.email}</p>
            </div>
          </div>

          {!confirmLogout ? (
            <button
              onClick={() => setConfirmLogout(true)}
              className="w-full py-2.5 text-gray-500 hover:text-red-600 font-medium rounded-xl text-sm transition-colors border border-transparent hover:border-red-100 hover:bg-red-50 cursor-pointer"
            >
              Log out
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-700 text-center font-medium">Are you sure you want to log out?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { localStorage.removeItem("session"); router.push("/customer/login"); }}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Yes, log out
                </button>
                <button
                  onClick={() => setConfirmLogout(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Toast */}
      {success && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 animate-fade-in"
          style={{ backgroundColor: "#1B2A5E", minWidth: 220, maxWidth: "90vw" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Profile saved successfully
        </div>
      )}
      {error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2"
          style={{ backgroundColor: "#B5535A", minWidth: 220, maxWidth: "90vw" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
