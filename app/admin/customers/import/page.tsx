"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map(line => {
    // Handle commas inside quoted fields
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += line[i];
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  }).filter(row => row["Name"]?.trim());
}

function mapRow(row: Record<string, string>) {
  return {
    name: row["Name"]?.trim() || "",
    customerType: row["Customer Type"]?.trim() || "B2B",
    phoneNumber: row["Phone Number"]?.trim() || "",
    building: row["Building"]?.trim() || "",
    apartment: row["Apartment"]?.trim() || "",
    floor: row["Floor"]?.trim() || "",
    street: row["Street"]?.trim() || "",
    city: row["City"]?.trim() || "",
    country: row["Country"]?.trim() || "Lebanon",
    additionalInstructions: row["Additional Instructions"]?.trim() || "",
    mapsLink: row["Google Maps Location"]?.trim() || "",
    manualHold: row["Manual Hold"]?.trim().toUpperCase() === "TRUE",
    deliveryFee: parseFloat(row["Delivery Fees"] || "0") || 0,
    clientMargin: parseFloat(row["Client Margin %"] || "0") || 0,
    clientDiscount: parseFloat(row["Client Discount %"] || "0") || 0,
    active: true,
    specialPrices: {},
    appsheetId: row["ID"]?.trim() || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export default function ImportCustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      setDone(false);
      setProgress(0);
      setErrors([]);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    setErrors([]);
    const errs: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const data = mapRow(rows[i]);
        await addDoc(collection(db, "customers"), data);
        setProgress(i + 1);
      } catch (err: any) {
        errs.push(`Row ${i + 2} (${rows[i]["Name"]}): ${err.message}`);
      }
    }

    setErrors(errs);
    setImporting(false);
    setDone(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Customers</h1>
          <p className="text-sm text-gray-500 mt-1">Upload your AppSheet CSV export</p>
        </div>
        <button onClick={() => router.push("/admin/customers")}
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
          ← Back to Customers
        </button>
      </div>

      {/* Upload */}
      <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-8 text-center mb-6">
        <p className="text-gray-500 text-sm mb-4">Select your "Customers Di Peppi.csv" file</p>
        <input type="file" accept=".csv" onChange={handleFile}
          className="block mx-auto text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700 cursor-pointer" />
      </div>

      {/* Preview */}
      {rows.length > 0 && !done && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{rows.length} customers ready to import</span>
              <span className="text-xs text-gray-400">Preview — first 10 rows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {["Name","Type","Phone","City","Country","Hold","Delivery Fee","Margin%","Discount%"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, 10).map((row, i) => {
                    const m = mapRow(row);
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 max-w-[160px] truncate">{m.name}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.customerType === "B2B" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                            {m.customerType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{m.phoneNumber || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.city || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.country}</td>
                        <td className="px-3 py-2">{m.manualHold ? <span className="text-red-500 font-medium">Hold</span> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{m.deliveryFee || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.clientMargin || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{m.clientDiscount || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && (
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-center">
                + {rows.length - 10} more customers not shown
              </div>
            )}
          </div>

          <button onClick={handleImport} disabled={importing}
            className="w-full py-3 text-white font-semibold rounded-xl transition-all disabled:opacity-60"
            style={{ backgroundColor: "#1B2A5E" }}>
            {importing ? `Importing... ${progress} / ${rows.length}` : `Import All ${rows.length} Customers`}
          </button>

          {importing && (
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-2 bg-blue-600 rounded-full transition-all"
                style={{ width: `${(progress / rows.length) * 100}%` }} />
            </div>
          )}
        </>
      )}

      {/* Done */}
      {done && (
        <div className={`rounded-xl p-6 text-center ${errors.length === 0 ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
          <p className={`text-lg font-bold mb-1 ${errors.length === 0 ? "text-green-700" : "text-yellow-700"}`}>
            {errors.length === 0 ? `✓ All ${rows.length} customers imported successfully!` : `⚠ ${progress - errors.length} imported, ${errors.length} failed`}
          </p>
          {errors.length > 0 && (
            <div className="mt-3 text-left text-xs text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <button onClick={() => router.push("/admin/customers")}
            className="mt-4 px-6 py-2 text-white rounded-lg font-medium"
            style={{ backgroundColor: "#1B2A5E" }}>
            View Customers
          </button>
        </div>
      )}
    </div>
  );
}
