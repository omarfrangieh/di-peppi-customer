"use client";
import React from "react";

import { useEffect, useState, useRef, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { formatQty, formatPrice } from "@/lib/formatters";
import Image from "next/image";
import BarcodeDisplay from "./components/BarcodeDisplay";
import SearchInput from "@/components/SearchInput";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const DEFAULT_OPTIONS: { unit: string[]; storageType: string[]; category: string[]; origin: string[] } = {
  unit: ["Jar", "KG", "Piece", "Tin", "Tube"],
  storageType: ["Ambient", "Chilled", "Fresh", "Frozen", "Refrigerated"],
  category: [],
  origin: [],
};

function ProductImage({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const isValid = src && (src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://"));
  if (!isValid || failed) return null;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [search, setSearch] = useState("");
  const [newOption, setNewOption] = useState<Record<string, string>>({});
  const [showOptionsFor, setShowOptionsFor] = useState<string | null>(null);
  const [stockInProduct, setStockInProduct] = useState<any | null>(null);
  const [historyProduct, setHistoryProduct] = useState<any | null>(null);
  const [historyMovements, setHistoryMovements] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stockInQty, setStockInQty] = useState("");
  const [stockInNotes, setStockInNotes] = useState("");
  const [stockInSaving, setStockInSaving] = useState(false);
  const [stockInExpiry, setStockInExpiry] = useState("");
  const [productBatches, setProductBatches] = useState<Record<string, any[]>>({});
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<any>({
    name: "", productSubName: "", supplierId: "", supplier: "",
    category: "", origin: "", unit: "KG", storageType: "",
    costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "",
    active: true, requiresWeighing: false, trackExpiry: false,
    minWeightPerUnit: "", maxWeightPerUnit: "", barcodeNumber: "",
    vatRate: "",
  });
  const [addingSaving, setAddingSaving] = useState(false);
  const [showMarginsFor, setShowMarginsFor] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, Set<string>>>({
    pricing: new Set(),
    barcode: new Set(),
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inactiveStartRef = useRef<HTMLDivElement>(null);
  const productsHeadingRef = useRef<HTMLHeadingElement>(null);

  // Role-based access: read from session
  const isAdmin = (() => {
    try {
      const s = JSON.parse(localStorage.getItem("session") || "{}");
      return s.role === "Admin";
    } catch { return false; }
  })();

  // Scroll to top when Products heading is clicked
  const handleProductsHeadingClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Validate EAN-13 barcode format and check digit
  const validateEAN13 = (barcode: string): boolean => {
    if (!barcode || barcode.length !== 13) return false;
    if (!/^\d{13}$/.test(barcode)) return false;

    // Verify check digit
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(barcode[i], 10);
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const calculatedCheckDigit = (10 - (sum % 10)) % 10;
    const providedCheckDigit = parseInt(barcode[12], 10);

    return calculatedCheckDigit === providedCheckDigit;
  };

  // Generate valid EAN-13 barcode with GS1 compliance
  const generateBarcode = () => {
    // GS1 prefix for your region (using 89x for international)
    const gs1Prefix = "890"; // 890-899 is international allocation

    // Generate 9 random digits for the product code
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    const combined = (timestamp + random).slice(-9); // Get last 9 digits

    // 12 digits before check digit: GS1(3) + ProductCode(9)
    const code12 = gs1Prefix + combined;

    // Verify we have exactly 12 digits
    if (code12.length !== 12 || !/^\d{12}$/.test(code12)) {
      console.error("Invalid code12 length:", code12);
      return null;
    }

    // Calculate EAN-13 check digit using GS1 algorithm
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code12[i], 10);
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    return code12 + checkDigit;
  };

  const toggleSection = (productId: string, section: 'pricing' | 'barcode') => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev[section]);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return { ...prev, [section]: newSet };
    });
  };

  const printSingleBarcode = async (product: any) => {
    if (!product.barcodeNumber) {
      alert("No barcode to print");
      return;
    }

    // Validate barcode is proper EAN-13 format (13 digits)
    const barcode = String(product.barcodeNumber).trim();
    if (!/^\d{13}$/.test(barcode)) {
      alert(`Invalid barcode format: "${barcode}". Must be 13 digits for EAN-13.`);
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; }
          body { font-family: Arial, sans-serif; background: white; display: flex; align-items: center; justify-content: center; padding: 0; }
          .page { width: 210mm; height: 297mm; background: white; display: flex; align-items: center; justify-content: center; }
          .label {
            width: 50.8mm;
            height: 25.4mm;
            padding: 1.5mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            border: 1px solid #999;
            background: white;
            gap: 0.5mm;
          }
          .product-name {
            font-size: 4pt;
            font-weight: bold;
            text-align: center;
            word-wrap: break-word;
            width: 100%;
            line-height: 1;
            flex: 0 0 auto;
            display: none;
          }
          .barcode-container {
            text-align: center;
            margin: 0;
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
          }
          .barcode-container svg {
            width: 45mm;
            height: auto;
            max-height: 12mm;
          }
          .barcode-number {
            font-size: 5pt;
            font-family: monospace;
            font-weight: bold;
            letter-spacing: 0px;
            text-align: center;
            width: 100%;
            flex: 0 0 auto;
            margin-top: 0.5mm;
          }
          .supplier {
            font-size: 4pt;
            color: #666;
            text-align: center;
            width: 100%;
            flex: 0 0 auto;
            display: none;
          }
          @page { size: A4; margin: 0; }
          @media print {
            body { padding: 0; background: white; }
            .page { width: 210mm; height: 297mm; }
          }
        </style>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      </head>
      <body>
        <div class="page">
          <div class="label">
            <div class="product-name">${product.name}</div>
            <div class="barcode-container">
              <svg id="barcode"></svg>
            </div>
            <div class="barcode-number">${product.barcodeNumber}</div>
            <div class="supplier">${product.supplier || ""}</div>
          </div>
        </div>
        <script>
          JsBarcode("#barcode", "${product.barcodeNumber}", {
            format: "EAN13",
            width: 2,
            height: 80,
            displayValue: false,
            margin: 5
          });
          setTimeout(() => window.print(), 500);
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const togglePrintSelection = (productId: string) => {
    const newSelected = new Set(selectedForPrint);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedForPrint(newSelected);
  };

  const exportBarcodesPDF = async () => {
    if (selectedForPrint.size === 0) {
      alert("Please select products to print");
      return;
    }

    setIsPrinting(true);
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const selected = Array.from(selectedForPrint);
      const productsToExport = products.filter(p => {
        if (!selected.includes(p.id) || !p.barcodeNumber) return false;
        // Validate EAN-13 format
        const barcode = String(p.barcodeNumber).trim();
        return /^\d{13}$/.test(barcode);
      });

      if (productsToExport.length === 0) {
        alert("No products with valid EAN-13 barcodes to export");
        return;
      }

      const labelWidth = 50.8; // mm (2 inches)
      const labelHeight = 25.4; // mm (1 inch)
      const pageHeight = 297; // A4 height in mm
      const pageWidth = 210; // A4 width in mm
      const labelOffsetX = (pageWidth - labelWidth) / 2; // Center horizontally
      const labelOffsetY = (pageHeight - labelHeight) / 2; // Center vertically

      for (let idx = 0; idx < productsToExport.length; idx++) {
        const product = productsToExport[idx];

        // Create label element
        const labelElement = document.createElement("div");
        labelElement.style.width = `${labelWidth}mm`;
        labelElement.style.height = `${labelHeight}mm`;
        labelElement.style.padding = "1.5mm";
        labelElement.style.boxSizing = "border-box";
        labelElement.style.border = "1px solid #999";
        labelElement.style.display = "flex";
        labelElement.style.flexDirection = "column";
        labelElement.style.justifyContent = "center";
        labelElement.style.alignItems = "center";
        labelElement.style.gap = "0.5mm";
        labelElement.style.fontFamily = "Arial";
        labelElement.style.backgroundColor = "white";
        labelElement.style.position = "absolute";
        labelElement.style.left = "-9999px";

        const nameDiv = document.createElement("div");
        nameDiv.style.fontSize = "4pt";
        nameDiv.style.fontWeight = "bold";
        nameDiv.style.textAlign = "center";
        nameDiv.style.wordWrap = "break-word";
        nameDiv.style.width = "100%";
        nameDiv.style.lineHeight = "1";
        nameDiv.style.display = "none";
        nameDiv.textContent = product.name;

        const barcodeContainer = document.createElement("div");
        barcodeContainer.style.textAlign = "center";
        barcodeContainer.style.margin = "0";
        barcodeContainer.style.flex = "0 0 auto";
        barcodeContainer.style.display = "flex";
        barcodeContainer.style.flexDirection = "column";
        barcodeContainer.style.alignItems = "center";
        barcodeContainer.style.justifyContent = "center";
        barcodeContainer.style.width = "100%";

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.width = "45mm";
        svg.style.height = "auto";
        svg.style.maxHeight = "12mm";

        const barcodeNumberDiv = document.createElement("div");
        barcodeNumberDiv.style.fontSize = "5pt";
        barcodeNumberDiv.style.fontFamily = "monospace";
        barcodeNumberDiv.style.fontWeight = "bold";
        barcodeNumberDiv.style.letterSpacing = "0px";
        barcodeNumberDiv.style.textAlign = "center";
        barcodeNumberDiv.style.width = "100%";
        barcodeNumberDiv.style.marginTop = "0.5mm";
        barcodeNumberDiv.textContent = product.barcodeNumber;

        const supplierDiv = document.createElement("div");
        supplierDiv.style.fontSize = "9pt";
        supplierDiv.style.color = "#666";
        supplierDiv.style.textAlign = "center";
        supplierDiv.style.width = "100%";
        supplierDiv.textContent = product.supplier || "";

        barcodeContainer.appendChild(svg);
        labelElement.appendChild(nameDiv);
        labelElement.appendChild(barcodeContainer);
        labelElement.appendChild(barcodeNumberDiv);
        labelElement.appendChild(supplierDiv);

        document.body.appendChild(labelElement);

        // Generate barcode with jsbarcode (EAN-13 with GS1 compliance)
        const JsBarcode = (window as any).JsBarcode;
        JsBarcode(svg, product.barcodeNumber, {
          format: "EAN13",
          width: 2,
          height: 80,
          displayValue: false,
          margin: 5,
        });

        // Convert to canvas
        const canvas = await html2canvas(labelElement, {
          scale: 2,
          backgroundColor: "white",
          logging: false,
        });

        const imgData = canvas.toDataURL("image/png");

        // Add new page for each label (except first one which is already added)
        if (idx > 0) {
          pdf.addPage();
        }

        // Add centered label image to PDF
        pdf.addImage(imgData, "PNG", labelOffsetX, labelOffsetY, labelWidth, labelHeight);

        document.body.removeChild(labelElement);
      }

      pdf.save("barcodes.pdf");
      setSelectedForPrint(new Set());
      alert(`Exported ${productsToExport.length} barcode(s) successfully`);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("Failed to export PDF");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleImageUpload = async (productId: string, file: File) => {
    if (!file) return;
    setUploadingImage(productId);
    try {
      const storageRef = ref(storage, `products/${productId}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "products", productId), { productImage: url });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, productImage: url } : p));
      if (editing === productId) {
        setEditData((p: any) => ({ ...p, productImage: url }));
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      alert("Failed to upload image");
    } finally {
      setUploadingImage(null);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Load products first — show them even if other collections fail
      const snap = await getDocs(collection(db, "products"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProducts(data);

      // Load options and suppliers independently — don't block products on failure
      try {
        const [optSnap, suppSnap] = await Promise.all([
          getDoc(doc(db, "settings", "productOptions")),
          getDocs(collection(db, "suppliers")),
        ]);
        setSuppliers(suppSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a:any, b:any) => (a.name||'').localeCompare(b.name||'')));
        if (optSnap.exists()) {
          setOptions({ ...DEFAULT_OPTIONS, ...optSnap.data() });
        }
      } catch (e) {
        console.warn("Could not load options/suppliers:", e);
      }

      // Load expiring batches — optional, don't block products on failure
      try {
        const movSnap = await getDocs(collection(db, "stockMovements"));
        const now = new Date();
        const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const batchMap: Record<string, any[]> = {};
        movSnap.forEach(d => {
          const m = d.data();
          if (!m.expiryDate || m.movementType !== "In") return;
          const expiry = new Date(m.expiryDate);
          if (expiry > in90Days) return;
          if (!batchMap[m.productId]) batchMap[m.productId] = [];
          batchMap[m.productId].push({
            expiryDate: m.expiryDate,
            quantity: m.quantity,
            expired: expiry < now,
            critical: expiry < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        });
        setProductBatches(batchMap);
      } catch (e) {
        console.warn("Could not load stock movements:", e);
      }
    } catch (err) {
      console.error("Failed to load products:", err);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvTemplate = () => {
    const headers = "name,productSubName,supplier,category,origin,unit,storageType,costPrice,b2bPrice,b2cPrice,vatRate,minStock,barcodeNumber,requiresWeighing,trackExpiry,active";
    const example = "Olive Oil Extra Virgin,500ml,LE MARIN TRAITEUR,Oils,ITALY,Jar,Ambient,12.50,18.00,22.00,,10,1234567890123,false,false,true";
    const blob = new Blob([headers + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { alert("CSV has no data rows."); return; }

    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ""; });
      return obj;
    });

    const invalid = rows.filter(r => !r.name);
    if (invalid.length) { alert(`${invalid.length} row(s) are missing a product name. Fix and re-import.`); return; }

    const confirmed = confirm(`Import ${rows.length} products? This will add them to the database.`);
    if (!confirmed) return;

    let imported = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const supplierMatch = suppliers.find((s: any) => s.name?.toLowerCase() === row.supplier?.toLowerCase());
        await addDoc(collection(db, "products"), {
          name: row.name.trim(),
          productSubName: row.productSubName || "",
          supplierId: supplierMatch?.id || "",
          supplier: row.supplier || "",
          category: row.category || "",
          origin: row.origin || "",
          unit: row.unit || "KG",
          storageType: row.storageType || "",
          costPrice: Number(row.costPrice || 0),
          b2bPrice: Number(row.b2bPrice || 0),
          b2cPrice: Number(row.b2cPrice || 0),
          vatRate: row.vatRate ? Number(row.vatRate) : null,
          minStock: Number(row.minStock || 0),
          barcodeNumber: row.barcodeNumber || "",
          requiresWeighing: row.requiresWeighing === "true",
          trackExpiry: row.trackExpiry === "true",
          active: row.active !== "false",
          stock: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        imported++;
      } catch {
        failed++;
      }
    }

    alert(`Import complete: ${imported} added${failed ? `, ${failed} failed` : ""}.`);
    // Reload products
    const snap = await getDocs(collection(db, "products"));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const saveNewProduct = async () => {
    if (!newProduct.name.trim()) { alert("Product name is required"); return; }
    setAddingSaving(true);
    try {
      await addDoc(collection(db, "products"), {
        name: newProduct.name.trim(),
        productSubName: newProduct.productSubName || "",
        supplierId: newProduct.supplierId || "",
        supplier: newProduct.supplier || "",
        category: newProduct.category || "",
        origin: newProduct.origin || "",
        unit: newProduct.unit || "KG",
        storageType: newProduct.storageType || "",
        costPrice: Number(newProduct.costPrice || 0),
        b2bPrice: Number(newProduct.b2bPrice || 0),
        b2cPrice: Number(newProduct.b2cPrice || 0),
        minStock: Number(newProduct.minStock || 0),
        currentStock: 0,
        active: true,
        requiresWeighing: Boolean(newProduct.requiresWeighing),
        trackExpiry: Boolean(newProduct.trackExpiry),
        minWeightPerUnit: newProduct.minWeightPerUnit ? Number(newProduct.minWeightPerUnit) : null,
        maxWeightPerUnit: newProduct.maxWeightPerUnit ? Number(newProduct.maxWeightPerUnit) : null,
        barcodeNumber: newProduct.barcodeNumber || "",
        vatRate: newProduct.vatRate ? Number(newProduct.vatRate) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setShowAddProduct(false);
      setNewProduct({ name: "", productSubName: "", supplierId: "", supplier: "", category: "", origin: "", unit: "KG", storageType: "", costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "", active: true, requiresWeighing: false, trackExpiry: false, minWeightPerUnit: "", maxWeightPerUnit: "", barcodeNumber: "", vatRate: "" });
      await load();
    } finally {
      setAddingSaving(false);
    }
  };

  const startEdit = (product: any) => {
    setEditing(product.id);
    setEditData({ ...product });
  };

  const cancelEdit = () => { setEditing(null); setEditData({}); };

  const deleteProduct = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" permanently? This cannot be undone.`)) return;
    setSaving(id);
    try {
      await deleteDoc(doc(db, "products", id));
      setProducts(prev => prev.filter(p => p.id !== id));
      setEditing(null);
      setEditData({});
    } catch (err: any) {
      alert(err.message || "Failed to delete product");
    } finally {
      setSaving(null);
    }
  };

  const saveProduct = async (id: string) => {
    setSaving(id);
    try {
      const { id: _, ...data } = editData;
      // supplierId and supplier name both saved
      await updateDoc(doc(db, "products", id), {
        ...data,
        active: Boolean(editData.active),
        minStock: Number(editData.minStock || 0),
        minWeightPerUnit: editData.minWeightPerUnit ? Number(editData.minWeightPerUnit) : null,
        maxWeightPerUnit: editData.maxWeightPerUnit ? Number(editData.maxWeightPerUnit) : null,
        requiresWeighing: Boolean(editData.requiresWeighing || false),
        trackExpiry: Boolean(editData.trackExpiry || false),
        updatedAt: new Date().toISOString(),
      });
      setProducts(prev => prev.map(p => p.id === id ? { ...editData } : p));
      setEditing(null);
    } finally {
      setSaving(null);
    }
  };

  const saveOptions = async (field: string, newList: string[]) => {
    const updated = { ...options, [field]: newList };
    setOptions(updated);
    await setDoc(doc(db, "settings", "productOptions"), updated, { merge: true });
  };

  const loadHistory = async (product: any) => {
    setHistoryProduct(product);
    setHistoryLoading(true);
    try {
      const snap = await getDocs(collection(db, "stockMovements"));
      const movements = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((d: any) => d.productId === product.id)
        .sort((a: any, b: any) => {
          const aDate = a.createdAt?.seconds || 0;
          const bDate = b.createdAt?.seconds || 0;
          return bDate - aDate;
        });
      setHistoryMovements(movements);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleStockIn = async () => {
    if (!stockInProduct || !stockInQty || Number(stockInQty) <= 0) return;
    setStockInSaving(true);
    try {
      const qty = Number(stockInQty);
      await addDoc(collection(db, "stockMovements"), {
        productId: stockInProduct.id,
        productName: stockInProduct.name || "",
        quantity: qty,
        movementType: "In",
        source: "manual",
        notes: stockInNotes || "Manual stock addition",
        expiryDate: stockInExpiry || null,
        batchDate: new Date().toISOString().slice(0, 10),
        remainingQty: qty,
        movementDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      // Recalculate stock
      const movSnap = await getDocs(collection(db, "stockMovements"));
      const movements = movSnap.docs
        .map(d => d.data())
        .filter(d => d.productId === stockInProduct.id);
      const newStock = movements.reduce((sum, m) => {
        return m.movementType === "In" ? sum + Number(m.quantity) : sum - Number(m.quantity);
      }, 0);
      await updateDoc(doc(db, "products", stockInProduct.id), { currentStock: newStock });
      setProducts(prev => prev.map(p => p.id === stockInProduct.id ? { ...p, currentStock: newStock } : p));
      setStockInProduct(null);
      setStockInQty("");
      setStockInNotes("");
    } catch(e) {
      console.error(e);
      alert("Error adding stock");
    } finally {
      setStockInSaving(false);
    }
  };

  const addOption = async (field: string) => {
    const val = (newOption[field] || "").trim();
    if (!val) return;
    const list = options[field as keyof typeof options] as string[];
    if (list.includes(val)) return;
    const newList = [...list, val];
    await saveOptions(field, newList);
    setNewOption(prev => ({ ...prev, [field]: "" }));
  };

  const removeOption = async (field: string, val: string) => {
    const list = (options[field as keyof typeof options] as string[]).filter(v => v !== val);
    await saveOptions(field, list);
  };

  const filtered = products
    .filter(p =>
      (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Active products first, then inactive
      if ((a.active !== false) !== (b.active !== false)) {
        return (a.active !== false) ? -1 : 1;
      }
      // Then sort by name
      return (a.name || "").localeCompare(b.name || "");
    });

  const inactiveCount = filtered.filter(p => p.active === false).length;
  const inactiveStartIndex = filtered.findIndex(p => p.active === false);

  const storageColor: Record<string, string> = {
    Frozen: "bg-blue-100 text-blue-700",
    Refrigerated: "bg-cyan-100 text-cyan-700",
    Chilled: "bg-sky-100 text-sky-700",
    Fresh: "bg-green-100 text-green-700",
    Ambient: "bg-orange-100 text-orange-700",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Bulk Print Controls */}
      {selectedForPrint.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="text-sm font-medium text-blue-900">
            {selectedForPrint.size} product{selectedForPrint.size !== 1 ? "s" : ""} selected for printing
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelectedForPrint(new Set())}
              className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded hover:bg-blue-100">
              Clear
            </button>
            <button onClick={exportBarcodesPDF} disabled={isPrinting}
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium">
              {isPrinting ? "Exporting..." : "📥 Export PDF"}
            </button>
            <button onClick={() => {
              const selected = Array.from(selectedForPrint);
              const productsToExport = products.filter(p => {
                if (!selected.includes(p.id) || !p.barcodeNumber) return false;
                // Validate EAN-13 format
                const barcode = String(p.barcodeNumber).trim();
                return /^\d{13}$/.test(barcode);
              });
              if (productsToExport.length === 0) {
                alert("No products with valid EAN-13 barcodes to print");
                return;
              }
              const printWindow = window.open("", "_blank");
              if (!printWindow) return;
              let html = `<!DOCTYPE html><html><head><style>
                * { margin: 0; padding: 0; }
                html, body { width: 100%; height: 100%; }
                body { font-family: Arial, sans-serif; background: white; }
                .page { width: 210mm; height: 297mm; background: white; display: flex; align-items: center; justify-content: center; page-break-after: always; }
                .label { width: 50.8mm; height: 25.4mm; padding: 1.5mm; box-sizing: border-box; display: flex;
                  flex-direction: column; justify-content: center; align-items: center; gap: 0.5mm;
                  border: 1px solid #999; background: white; }
                .product-name { font-size: 4pt; font-weight: bold; text-align: center; word-wrap: break-word; width: 100%; line-height: 1; display: none; }
                .barcode-container { text-align: center; margin: 0; flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }
                .barcode-container svg { width: 45mm; height: auto; max-height: 12mm; }
                .barcode-number { font-size: 5pt; font-family: monospace; font-weight: bold; letter-spacing: 0px; text-align: center; width: 100%; margin-top: 0.5mm; }
                .supplier { font-size: 4pt; color: #666; text-align: center; width: 100%; display: none; }
                @page { size: A4; margin: 0; }
                @media print { body { background: white; } .page { width: 210mm; height: 297mm; page-break-after: always; } }
              </style>
              <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
              </head><body>`;
              productsToExport.forEach((p: any, idx: number) => {
                html += `<div class="page"><div class="label">
                  <div class="product-name">${p.name}</div>
                  <div class="barcode-container"><svg id="barcode${idx}"></svg></div>
                  <div class="barcode-number">${p.barcodeNumber}</div>
                  <div class="supplier">${p.supplier || ""}</div>
                </div></div>`;
              });
              html += `<script>
                ${productsToExport.map((p: any, idx: number) =>
                  `JsBarcode("#barcode${idx}", "${p.barcodeNumber}", {format: "EAN13", width: 2, height: 80, displayValue: false, margin: 5});`
                ).join("\n")}
                setTimeout(() => window.print(), 500);
              <\/script></body></html>`;
              printWindow.document.write(html);
              printWindow.document.close();
            }}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 font-medium">
              🖨️ Print All
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">

          <div className="h-4 w-px bg-gray-200" />
          <h1
            onClick={handleProductsHeadingClick}
            className="text-xl font-bold cursor-pointer transition-opacity hover:opacity-70"
            style={{color: "#B5535A"}}
            title="Click to scroll to top"
          >
            Products
          </h1>
          <span className="text-xs text-gray-400">{products.filter(p => p.active !== false).length} products</span>
        </div>
        <div className="flex items-center gap-3">
          {inactiveCount > 0 && (
            <button
              onClick={() => inactiveStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-3 py-1.5 text-xs border border-amber-300 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 font-medium"
            >
              ↓ Inactive ({inactiveCount})
            </button>
          )}
          <button
            onClick={() => setShowOptionsFor(showOptionsFor ? null : "unit")}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            ⚙️ Manage Dropdowns
          </button>
          <input
            id="csv-import-input"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <div className="flex items-center gap-1">
            <button
              onClick={() => document.getElementById("csv-import-input")?.click()}
              className="px-3 py-1.5 text-sm rounded-lg font-medium border"
              style={{borderColor: "#1B2A5E", color: "#1B2A5E"}}
              title="Import products from CSV"
            >
              ↑ Import CSV
            </button>
            <button
              onClick={downloadCsvTemplate}
              className="px-2 py-1.5 text-sm rounded-lg border"
              style={{borderColor: "#1B2A5E", color: "#1B2A5E"}}
              title="Download CSV template"
            >
              ⬇
            </button>
          </div>
          <button
            onClick={() => setShowAddProduct(true)}
            className="px-4 py-1.5 text-sm text-white rounded-lg font-medium"
            style={{backgroundColor: "#1B2A5E"}}
          >
            + Add Product
          </button>
          <SearchInput
            placeholder="Search products..."
            value={search}
            onChange={setSearch}
            className="w-48"
          />
        </div>
      </div>

      {/* Options Manager */}
      {showOptionsFor && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex gap-6">
            {(["unit", "storageType", "category", "origin"] as const).map(field => (
              <div key={field} className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">{field}</p>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(options[field] as string[]).map(val => (
                    <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                      {val}
                      <button onClick={() => removeOption(field, val)} className="text-gray-400 hover:text-red-500">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="Add..."
                    value={newOption[field] || ""}
                    onChange={e => setNewOption(prev => ({ ...prev, [field]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addOption(field)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none"
                  />
                  <button onClick={() => addOption(field)} className="px-2 py-1 bg-gray-900 text-white text-xs rounded">+</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((product, index) => (
            <div
              key={product.id}
              ref={index === inactiveStartIndex && inactiveStartIndex !== -1 ? inactiveStartRef : null}
              className={`bg-white rounded-lg border transition-colors ${
              editing === product.id ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            } ${product.active === false ? "opacity-50" : ""}`}>

              {editing === product.id ? (
                /* EDIT MODE */
                <div className="space-y-3">
                  <div className="relative h-32 bg-white rounded-t-lg overflow-hidden group flex items-center justify-center">
                    <ProductImage src={editData.productImage} alt={editData.name} className="max-w-full max-h-full object-contain" />
                    {!editData.productImage && (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">📷 No image</div>
                    )}
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden"
                      onChange={e => e.target.files && handleImageUpload(product.id, e.target.files[0])} />
                    <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage === product.id}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity disabled:opacity-50">
                      {uploadingImage === product.id ? "⏳ Uploading..." : "📸 Change Image"}
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    <input value={editData.name || ""} onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-semibold" />
                  <input value={editData.productSubName || ""} onChange={e => setEditData((p: any) => ({ ...p, productSubName: e.target.value }))}
                    placeholder="Sub name..." className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />

                  <select value={editData.supplierId || ""} onChange={e => {
                      const s = suppliers.find((s:any) => s.id === e.target.value);
                      setEditData((p: any) => ({ ...p, supplierId: e.target.value, supplier: s?.name || "" }));
                    }} className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                    <option value="">— Supplier —</option>
                    {suppliers.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <select value={editData.category || ""} onChange={e => setEditData((p: any) => ({ ...p, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Category</option>
                      {editData.category && !options.category.includes(editData.category) && <option value={editData.category}>{editData.category}</option>}
                      {options.category.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <select value={editData.origin || ""} onChange={e => setEditData((p: any) => ({ ...p, origin: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Origin</option>
                      {editData.origin && !options.origin.includes(editData.origin) && <option value={editData.origin}>{editData.origin}</option>}
                      {options.origin.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select value={editData.unit || ""} onChange={e => setEditData((p: any) => ({ ...p, unit: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Unit</option>
                      {editData.unit && !options.unit.includes(editData.unit) && <option value={editData.unit}>{editData.unit}</option>}
                      {options.unit.map(o => <option key={o}>{o}</option>)}
                    </select>
                    <select value={editData.storageType || ""} onChange={e => setEditData((p: any) => ({ ...p, storageType: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                      <option value="">Storage</option>
                      {editData.storageType && !options.storageType.includes(editData.storageType) && <option value={editData.storageType}>{editData.storageType}</option>}
                      {options.storageType.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">Barcode</label>
                      <input value={editData.barcodeNumber || ""} onChange={e => setEditData((p: any) => ({ ...p, barcodeNumber: e.target.value }))}
                        placeholder="Enter or generate..." className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                    </div>
                    <button onClick={() => {
                      const newBarcode = generateBarcode();
                      setEditData((p: any) => ({ ...p, barcodeNumber: newBarcode }));
                    }}
                      className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 font-medium">
                      Generate
                    </button>
                  </div>

                  {editData.barcodeNumber && /^\d{13}$/.test(String(editData.barcodeNumber).trim()) && <BarcodeDisplay barcodeNumber={editData.barcodeNumber} size="md" showNumber={true} />}
                  {editData.barcodeNumber && !/^\d{13}$/.test(String(editData.barcodeNumber).trim()) && <div className="text-xs text-red-500 font-medium">⚠️ Invalid barcode (must be 13 digits). Click Generate for a valid EAN-13.</div>}

                  <div className="border-t pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Cost</label>
                        <input type="number" value={editData.costPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, costPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">B2B</label>
                        <input type="number" value={editData.b2bPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2bPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                        {editData.costPrice > 0 && editData.b2bPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                            {((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">B2C</label>
                        <input type="number" value={editData.b2cPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2cPrice: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                        {editData.costPrice > 0 && editData.b2cPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                            {((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">VAT Rate (%)</label>
                      <input type="number" value={editData.vatRate || ""} onChange={e => setEditData((p: any) => ({ ...p, vatRate: e.target.value }))}
                        placeholder="Empty = exempt" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                      <p className="text-xs text-gray-400 mt-0.5">Leave empty for exempt</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Min Stock</label>
                      <input type="number" value={editData.minStock || ""} onChange={e => setEditData((p: any) => ({ ...p, minStock: e.target.value }))}
                        placeholder="0" className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={editData.active !== false} onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                        <span>Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-gray-200 hover:bg-gray-50">
                      <div onClick={() => setEditData((p: any) => ({ ...p, requiresWeighing: !p.requiresWeighing }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.requiresWeighing ? "bg-blue-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.requiresWeighing ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium">⚖️ Requires Weighing</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-gray-200 hover:bg-gray-50">
                      <div onClick={() => setEditData((p: any) => ({ ...p, trackExpiry: !p.trackExpiry }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.trackExpiry ? "bg-orange-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.trackExpiry ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium">📦 FIFO / Track Expiry</span>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => saveProduct(product.id)} disabled={saving === product.id}
                      className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50 font-medium">
                      {saving === product.id ? "..." : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="flex-1 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded hover:bg-gray-50 font-medium">
                      Cancel
                    </button>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteProduct(product.id, product.name)}
                      disabled={saving === product.id}
                      className="w-full mt-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded disabled:opacity-50 font-medium"
                    >
                      🗑 Delete Product
                    </button>
                  )}
                </div>
                </div>
              ) : (
                /* VIEW MODE */
                <div className="space-y-3">
                  <div className="h-32 bg-white rounded-t-lg overflow-hidden flex items-center justify-center">
                    <ProductImage src={product.productImage} alt={product.name} className="max-w-full max-h-full object-contain" />
                    {!product.productImage && (
                      <div className="text-gray-400 text-center">
                        <div className="text-3xl mb-1">📦</div>
                        <div className="text-xs">No image</div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                      {product.productSubName && <p className="text-xs text-gray-500">{product.productSubName}</p>}
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                          (Number(product.currentStock || 0) === 0 || (Number(product.minStock) > 0 && Number(product.currentStock || 0) < Number(product.minStock))) ? "bg-red-100 text-red-700" :
                          (Number(product.minStock) > 0 && Number(product.currentStock || 0) === Number(product.minStock)) ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {formatQty(product.currentStock)} {product.unit || ""}
                        </span>
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                          product.active !== false ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {product.active !== false ? "✓ Active" : "○ Inactive"}
                        </span>
                      </div>
                    </div>

                  <div className="flex flex-wrap gap-2">
                    {product.supplier && <span className="text-xs bg-gray-100 px-2 py-1 rounded">🏭 {product.supplier}</span>}
                    {product.category && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{product.category}</span>}
                    {product.origin && <span className="text-xs bg-gray-100 px-2 py-1 rounded">{product.origin}</span>}
                  </div>

                  {product.barcodeNumber && (
                    <>
                      <button
                        onClick={() => toggleSection(product.id, 'barcode')}
                        className="w-full text-left py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border-t flex items-center gap-2"
                      >
                        {expandedSections.barcode.has(product.id) ? '▼' : '▶'} Barcode (ID: {product.barcodeNumber})
                      </button>
                      {expandedSections.barcode.has(product.id) && (
                        <div className="flex justify-center py-2">
                          <BarcodeDisplay barcodeNumber={product.barcodeNumber} size="sm" showNumber={true} />
                        </div>
                      )}
                    </>
                  )}

                  {product.requiresWeighing && <span className="text-xs text-purple-600 block">⚖️ Requires weighing</span>}
                  {product.trackExpiry && <span className="text-xs text-blue-600 block">📅 Track expiry</span>}

                  {productBatches[product.id]?.length > 0 && (
                    <div className="space-y-1">
                      {productBatches[product.id].map((batch, i) => (
                        <div key={i} className={`text-xs px-2 py-1 rounded ${
                          batch.expired ? "bg-red-100 text-red-700" :
                          batch.critical ? "bg-orange-100 text-orange-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {batch.expired ? "❌ Expired" : batch.critical ? "⚠️ Expiring" : "🟡 Soon"} {new Date(batch.expiryDate).toLocaleDateString("en-GB")}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
                    <div>
                      <p className="text-xs text-gray-500">Stock</p>
                      <p className={
                        (Number(product.currentStock || 0) === 0 || (Number(product.minStock) > 0 && Number(product.currentStock || 0) < Number(product.minStock))) ? "text-red-600 font-semibold" :
                        (Number(product.minStock) > 0 && Number(product.currentStock || 0) === Number(product.minStock)) ? "text-yellow-600 font-semibold" :
                        "text-gray-900"
                      }>
                        {formatQty(product.currentStock)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Min</p>
                      <p className="text-gray-900">{product.minStock || "—"}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSection(product.id, 'pricing')}
                    className="w-full text-left py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border-t flex items-center gap-2"
                  >
                    {expandedSections.pricing.has(product.id) ? '▼' : '▶'} Pricing & Margins
                  </button>

                  {expandedSections.pricing.has(product.id) && (
                    <>
                      <div className="grid grid-cols-3 gap-2 py-2">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Cost</p>
                          <p className="font-semibold text-gray-900">${formatPrice(product.costPrice || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">B2B</p>
                          <p className="font-semibold text-gray-900">${formatPrice(product.b2bPrice || 0)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">B2C</p>
                          <p className="font-semibold text-gray-900">${formatPrice(product.b2cPrice || 0)}</p>
                        </div>
                      </div>

                      {product.costPrice > 0 && (
                        <div className="space-y-2 py-2 border-t">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">B2B Margin</p>
                            {product.b2bPrice > 0 ? (
                              <div className={`text-sm font-semibold ${((product.b2bPrice - product.costPrice) / product.b2bPrice * 100) < 10 ? "text-red-600" : "text-blue-600"}`}>
                                {((product.b2bPrice - product.costPrice) / product.b2bPrice * 100).toFixed(1)}%
                              </div>
                            ) : <p className="text-xs text-gray-400">No price set</p>}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">B2C Margin</p>
                            {product.b2cPrice > 0 ? (
                              <div className={`text-sm font-semibold ${((product.b2cPrice - product.costPrice) / product.b2cPrice * 100) < 15 ? "text-red-600" : "text-green-600"}`}>
                                {((product.b2cPrice - product.costPrice) / product.b2cPrice * 100).toFixed(1)}%
                              </div>
                            ) : <p className="text-xs text-gray-400">No price set</p>}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => startEdit(product)} className="flex-1 px-2 py-2 text-xs border border-gray-200 rounded hover:bg-gray-50 font-medium">
                      Edit
                    </button>
                    <button onClick={() => { setStockInProduct(product); setStockInQty(""); setStockInNotes(""); setStockInExpiry(""); }}
                      className="flex-1 px-2 py-2 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50 font-medium">
                      +Stock
                    </button>
                    <button onClick={() => loadHistory(product)}
                      className="flex-1 px-2 py-2 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 font-medium">
                      History
                    </button>
                  </div>

                  {product.barcodeNumber && (
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => printSingleBarcode(product)}
                        className="flex-1 px-2 py-2 text-xs border border-purple-300 text-purple-700 rounded hover:bg-purple-50 font-medium">
                        🖨️ Print Label
                      </button>
                      <button onClick={() => togglePrintSelection(product.id)}
                        className={`flex-1 px-2 py-2 text-xs rounded font-medium ${
                          selectedForPrint.has(product.id)
                            ? "bg-blue-600 text-white border border-blue-600"
                            : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}>
                        {selectedForPrint.has(product.id) ? "✓ Selected" : "Select"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Stock History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Stock History</h3>
                <p className="text-sm text-gray-500">{historyProduct.name}</p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            {historyLoading ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
            ) : historyMovements.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No movements found</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-left px-3 py-2">Notes</th>
                      <th className="text-left px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyMovements.map((m: any) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.movementType === "In" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {m.movementType === "In" ? "↑ In" : "↓ Out"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{formatQty(m.quantity)}</td>
                        <td className="px-3 py-2 text-gray-500">{m.source || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{m.notes || "—"}</td>
                        <td className="px-3 py-2 text-gray-400 text-xs">
                          {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">Current stock: <span className="font-semibold text-gray-900">{formatQty(historyProduct.currentStock)}</span></span>
              <button onClick={() => setHistoryProduct(null)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Add New Product</h3>
              <button onClick={() => setShowAddProduct(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Product Name *</label>
                  <input value={newProduct.name} onChange={e => setNewProduct((p:any) => ({...p, name: e.target.value}))}
                    placeholder="e.g. Octopus Cooked Skin" autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Sub Name</label>
                  <input value={newProduct.productSubName} onChange={e => setNewProduct((p:any) => ({...p, productSubName: e.target.value}))}
                    placeholder="e.g. Scientific name or French name"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Supplier</label>
                  <select value={newProduct.supplierId} onChange={e => {
                    const s = suppliers.find((s:any) => s.id === e.target.value);
                    setNewProduct((p:any) => ({...p, supplierId: e.target.value, supplier: s?.name || ""}));
                  }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">— Select Supplier —</option>
                    {suppliers.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Category</label>
                  <select value={newProduct.category} onChange={e => setNewProduct((p:any) => ({...p, category: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.category.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Origin</label>
                  <select value={newProduct.origin} onChange={e => setNewProduct((p:any) => ({...p, origin: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.origin.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                  <select value={newProduct.unit} onChange={e => setNewProduct((p:any) => ({...p, unit: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    {options.unit.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Storage Type</label>
                  <select value={newProduct.storageType} onChange={e => setNewProduct((p:any) => ({...p, storageType: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">—</option>
                    {options.storageType.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Barcode</label>
                      <input value={newProduct.barcodeNumber} onChange={e => setNewProduct((p:any) => ({...p, barcodeNumber: e.target.value}))}
                        placeholder="Enter supplier barcode or leave empty to generate"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <button onClick={() => {
                      const newBarcode = generateBarcode();
                      setNewProduct((p:any) => ({...p, barcodeNumber: newBarcode}));
                    }}
                      className="px-3 py-2 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300 font-medium whitespace-nowrap">
                      Generate
                    </button>
                  </div>
                  {newProduct.barcodeNumber && !/^\d{13}$/.test(String(newProduct.barcodeNumber).trim()) && <div className="text-xs text-red-500 font-medium">⚠️ Invalid barcode (must be 13 digits)</div>}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Cost Price ($)</label>
                  <input type="number" value={newProduct.costPrice} onChange={e => setNewProduct((p:any) => ({...p, costPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Min Stock</label>
                  <input type="number" value={newProduct.minStock} onChange={e => setNewProduct((p:any) => ({...p, minStock: e.target.value}))}
                    placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">B2B Price ($)</label>
                  <input type="number" value={newProduct.b2bPrice} onChange={e => setNewProduct((p:any) => ({...p, b2bPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {Number(newProduct.b2bPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                      Margin: {((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">B2C Price ($)</label>
                  <input type="number" value={newProduct.b2cPrice} onChange={e => setNewProduct((p:any) => ({...p, b2cPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  {Number(newProduct.b2cPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                      Margin: {((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">VAT Rate (%)</label>
                  <input type="number" value={newProduct.vatRate} onChange={e => setNewProduct((p:any) => ({...p, vatRate: e.target.value}))}
                    placeholder="Leave empty for VAT-exempt" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Leave empty for VAT-exempt items. E.g., 12 for 12% VAT</p>
                </div>
              </div>
              {(newProduct.unit === "KG" || newProduct.unit === "Piece") && (
                <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-amber-700">Weight range (kg):</span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Min</label>
                      <input type="number" step="0.01" value={newProduct.minWeightPerUnit}
                        onChange={e => setNewProduct((p:any) => ({...p, minWeightPerUnit: e.target.value}))}
                        className="w-20 border border-amber-200 rounded px-2 py-1 text-sm" placeholder="e.g. 0.9" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Max</label>
                      <input type="number" step="0.01" value={newProduct.maxWeightPerUnit}
                        onChange={e => setNewProduct((p:any) => ({...p, maxWeightPerUnit: e.target.value}))}
                        className="w-20 border border-amber-200 rounded px-2 py-1 text-sm" placeholder="e.g. 1.4" />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-1.5 text-xs text-purple-700 cursor-pointer">
                      <input type="checkbox" checked={!!newProduct.requiresWeighing}
                        onChange={e => setNewProduct((p:any) => ({...p, requiresWeighing: e.target.checked}))} />
                      ⚖️ Requires weighing at delivery
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer">
                      <input type="checkbox" checked={!!newProduct.trackExpiry}
                        onChange={e => setNewProduct((p:any) => ({...p, trackExpiry: e.target.checked}))} />
                      📅 Track expiry / FIFO
                    </label>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddProduct(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveNewProduct} disabled={addingSaving || !newProduct.name.trim()}
                  className="flex-1 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  style={{backgroundColor: "#1B2A5E"}}>
                  {addingSaving ? "Saving..." : "Create Product"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock In Modal */}
      {stockInProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Add Stock</h3>
            <p className="text-sm text-gray-500 mb-4">{stockInProduct.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Quantity to Add</label>
                <input type="number" min="0" step="0.001" value={stockInQty}
                  onChange={e => setStockInQty(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Notes (optional)</label>
                <input type="text" value={stockInNotes}
                  onChange={e => setStockInNotes(e.target.value)}
                  placeholder="e.g. Purchase from supplier"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              {stockInProduct?.trackExpiry && (
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">
                    📅 Expiry Date <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={stockInExpiry}
                    onChange={e => setStockInExpiry(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  {stockInExpiry && (
                    <p className={`text-xs mt-1 font-medium ${
                      new Date(stockInExpiry) < new Date() ? "text-red-700 font-bold" :
                      new Date(stockInExpiry) < new Date(Date.now() + 30*24*60*60*1000) ? "text-red-500" :
                      new Date(stockInExpiry) < new Date(Date.now() + 90*24*60*60*1000) ? "text-orange-500" :
                      "text-green-600"
                    }`}>
                      Expires: {new Date(stockInExpiry).toLocaleDateString("en-GB")}
                      {new Date(stockInExpiry) < new Date() ? " ❌ Already expired!" :
                       new Date(stockInExpiry) < new Date(Date.now() + 30*24*60*60*1000) ? " ⚠️ Expiring soon!" :
                       new Date(stockInExpiry) < new Date(Date.now() + 90*24*60*60*1000) ? " 🟡 Within 3 months" :
                       " ✅ Good"}
                    </p>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-400">Current stock: <span className="font-semibold text-gray-700">{formatQty(stockInProduct.currentStock)}</span> → After: <span className="font-semibold text-green-600">{formatQty(Number(stockInProduct.currentStock) + Number(stockInQty || 0))}</span></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStockInProduct(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleStockIn} disabled={stockInSaving || !stockInQty || Number(stockInQty) <= 0 || (stockInProduct?.trackExpiry && !stockInExpiry)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {stockInSaving ? "Saving..." : "Add Stock"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
  </div>
  );
}
