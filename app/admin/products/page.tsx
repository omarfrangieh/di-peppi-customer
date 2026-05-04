"use client";
import React from "react";

import { useEffect, useState, useRef, useCallback } from "react";
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, addDoc, deleteDoc, serverTimestamp, writeBatch, arrayUnion } from "firebase/firestore";
import { showToast } from "@/lib/toast";
import { db, storage, auth } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { signInAnonymously } from "firebase/auth";
import { formatQty, formatPrice, toTitleCase } from "@/lib/formatters";
import Image from "next/image";
import BarcodeDisplay from "./components/BarcodeDisplay";
import SearchInput from "@/components/SearchInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const DEFAULT_OPTIONS: { unit: string[]; storageType: string[]; category: string[]; origin: string[] } = {
  unit: ["Jar", "KG", "Piece", "Tin", "Tube"],
  storageType: ["Ambient", "Chilled", "Fresh", "Frozen"],
  category: [],
  origin: [],
};

function ProductImage({ src, images, alt, className }: { src?: string | null; images?: string[]; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  const resolved = (images && images.length > 0 ? images[0] : src) || null;
  const isValid = resolved && (resolved.startsWith("/") || resolved.startsWith("http://") || resolved.startsWith("https://"));
  if (!isValid || failed) return null;
  return <img src={resolved} alt={alt} className={className} onError={() => setFailed(true)} />;
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
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [cardImageIndexes, setCardImageIndexes] = useState<Record<string, number>>({});
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
    name: "", productSubName: "", brand: "", supplierId: "", supplier: "",
    category: "", origin: "", unit: "KG", storageType: "",
    costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "",
    active: true, requiresWeighing: false, trackExpiry: false,
    minWeightPerUnit: "", maxWeightPerUnit: "", packSizeG: "", barcodeNumber: "",
    vatRate: "", netWeightG: "", drainedWeightG: "", ingredients: "", allergens: "", description: "", b2cOnly: false, b2bOnly: false, caliber: "",
  });
  const [addingSaving, setAddingSaving] = useState(false);
  const [newProductImageFiles, setNewProductImageFiles] = useState<File[]>([]);
  const [newProductImagePreviews, setNewProductImagePreviews] = useState<string[]>([]);
  const newProductImageRef = useRef<HTMLInputElement>(null);
  const [showMarginsFor, setShowMarginsFor] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trashView, setTrashView] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("dp-products-view") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [newProductSupplierDropdownOpen, setNewProductSupplierDropdownOpen] = useState(false);
  const [newProductSupplierSearch, setNewProductSupplierSearch] = useState("");
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
      showToast("No barcode to print", "warning");
      return;
    }

    // Validate barcode is proper EAN-13 format (13 digits)
    const barcode = String(product.barcodeNumber).trim();
    if (!/^\d{13}$/.test(barcode)) {
      showToast(`Invalid barcode format: "${barcode}". Must be 13 digits for EAN-13.`, "warning");
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
      showToast("Please select products to print", "warning");
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
        showToast("No products with valid EAN-13 barcodes to export", "warning");
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
      showToast(`Exported ${productsToExport.length} barcode(s) successfully`, "success");
    } catch (err) {
      console.error("Error exporting PDF:", err);
      showToast("Failed to export PDF", "error");
    } finally {
      setIsPrinting(false);
    }
  };

  const handleImageUpload = async (productId: string, file: File) => {
    if (!file) return;
    setUploadingImage(productId);
    try {
      // Ensure Firebase Auth session exists for Storage access
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      const uniqueName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `products/${productId}/${uniqueName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      const product = products.find(p => p.id === productId);
      const existingImages: string[] = product?.productImages || (product?.productImage ? [product.productImage] : []);
      const updatedImages = [...existingImages, url];
      await updateDoc(doc(db, "products", productId), {
        productImages: updatedImages,
        productImage: updatedImages[0],
      });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, productImages: updatedImages, productImage: updatedImages[0] } : p));
      if (editing === productId) {
        setEditData((p: any) => ({ ...p, productImages: updatedImages, productImage: updatedImages[0] }));
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      showToast("Failed to upload image", "error");
    } finally {
      setUploadingImage(null);
    }
  };

  const handleImageDelete = async (productId: string, imageUrl: string) => {
    const product = products.find(p => p.id === productId);
    const existingImages: string[] = product?.productImages || (product?.productImage ? [product.productImage] : []);
    const updatedImages = existingImages.filter(u => u !== imageUrl);
    await updateDoc(doc(db, "products", productId), {
      productImages: updatedImages,
      productImage: updatedImages[0] || null,
    });
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, productImages: updatedImages, productImage: updatedImages[0] || null } : p));
    if (editing === productId) {
      setEditData((p: any) => ({ ...p, productImages: updatedImages, productImage: updatedImages[0] || null }));
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const params = new URLSearchParams(window.location.search);
    const q = params.get("search");
    if (q) setSearch(q);
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Load products first — show them even if other collections fail
      const snap = await getDocs(collection(db, "products"));
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Auto-purge products deleted more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const toAutoPurge = data.filter((p: any) => p.deleted && p.deletedAt && new Date(p.deletedAt) < thirtyDaysAgo);
      if (toAutoPurge.length > 0) {
        const purgeBatch = writeBatch(db);
        toAutoPurge.forEach((p: any) => purgeBatch.delete(doc(db, "products", p.id)));
        await purgeBatch.commit();
        const purgeIds = new Set(toAutoPurge.map((p: any) => p.id));
        data = data.filter((p: any) => !purgeIds.has(p.id));
      }

      setProducts(data);

      // Load options and suppliers independently — don't block products on failure
      try {
        const [optSnap, suppSnap] = await Promise.all([
          getDoc(doc(db, "settings", "productOptions")),
          getDocs(collection(db, "suppliers")),
        ]);
        setSuppliers(suppSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a:any, b:any) => (a.name||'').localeCompare(b.name||'')));
        if (optSnap.exists()) {
          const raw = { ...DEFAULT_OPTIONS, ...optSnap.data() };
          // Deduplicate unit list — collapse case variants (e.g. "Kg" + "KG" → keep first seen)
          const seen = new Set<string>();
          const dedupedUnits: string[] = [];
          for (const u of (raw.unit as string[])) {
            const key = u.trim().toUpperCase();
            if (!seen.has(key)) { seen.add(key); dedupedUnits.push(u.trim()); }
          }
          raw.unit = dedupedUnits.sort((a, b) => a.localeCompare(b));
          // Remove Refrigerated — same as Chilled
          raw.storageType = (raw.storageType as string[]).filter((s: string) => s !== "Refrigerated");
          setOptions(raw);
          // Persist the cleaned list if it changed
          if (dedupedUnits.length !== (optSnap.data().unit || []).length) {
            setDoc(doc(db, "settings", "productOptions"), { unit: raw.unit }, { merge: true }).catch(() => {});
          }
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
    const headers = [
      "name",            // Required — product name (no weight/size in name)
      "productSubName",  // Optional — size/format label e.g. "60g Tube", "500ml Jar"
      "brand",           // Optional — brand name
      "supplier",        // Optional — must match supplier name in system exactly
      "category",        // Optional — e.g. Anchovy, Octopus, Olive Oil
      "origin",          // Optional — country e.g. SPAIN, ITALY
      "unit",            // Required — Kg, Jar, Tin, Tube, Piece
      "storageType",     // Optional — Ambient, Chilled, Fresh, Frozen
      "costPrice",       // Optional — cost price (per unit / per kg)
      "b2bPrice",        // Optional — wholesale price
      "b2cPrice",        // Optional — retail price
      "vatRate",         // Optional — VAT % e.g. 11
      "minStock",        // Optional — reorder alert threshold
      "barcodeNumber",   // Optional — EAN/UPC barcode
      "caliber",         // Optional — e.g. 16/20, 20/30
      "description",     // Optional — product description
      "ingredients",     // Optional — ingredients list
      "allergens",       // Optional — e.g. Fish, Shellfish, Gluten
      "packSizeG",       // Optional — pack weight in grams (triggers per-kg price calc). Leave empty for fixed-price items
      "netWeightG",      // Optional — net weight in grams (display only, no price calc)
      "drainedWeightG",  // Optional — drained weight in grams for canned/jarred items
      "requiresWeighing",// Optional — true/false. Set true for whole fish/meat sold by kg
      "minWeightPerUnit",// Optional — min unit weight in grams (only if requiresWeighing=true)
      "maxWeightPerUnit",// Optional — max unit weight in grams (only if requiresWeighing=true)
      "b2cOnly",         // Optional — true/false. true = hidden from B2B catalogue
      "trackExpiry",     // Optional — true/false
      "active",          // Optional — true/false (default: true)
    ].join(",");

    const examples = [
      // Fixed-price jar — no packSizeG (price is per jar)
      "Anchovy Paste,60g Tube,Conserva Silvia,LE MARIN TRAITEUR,Anchovy,SPAIN,Tube,Ambient,3.50,6.00,8.00,11,20,,,Smooth anchovy paste in a convenient tube,Anchovies (Engraulis encrasicolus) 70% olive oil 30% salt,,60,,,false,,,false,false,true",
      // Canned tin — no packSizeG for fixed price
      "Octopus in Olive Oil,Pulpo en Aceite de Oliva,Los Peperetes,LE MARIN TRAITEUR,Octopus,SPAIN,Tin,Ambient,8.00,14.00,18.00,11,15,,,Octopus tentacles in extra virgin olive oil,Octopus olive oil salt lemon,Fish Shellfish,120,,,false,,,false,false,true",
      // Whole fish sold by kg — requiresWeighing
      "Octopus,,Le Marin Traiteur,LE MARIN TRAITEUR,Octopus,MAURITANIA,Kg,Fresh,12.00,17.00,,11,20,,16/20,Whole fresh octopus,,,,,800,1200,true,800,1200,false,false,true",
    ].join("\n");

    const blob = new Blob([headers + "\n" + examples], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "di-peppi-products-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const text = await file.text();
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { showToast("CSV has no data rows.", "warning"); return; }

    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(",");
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ""; });
      return obj;
    });

    const invalid = rows.filter(r => !r.name);
    if (invalid.length) { showToast(`${invalid.length} row(s) are missing a product name. Fix and re-import.`, "warning"); return; }

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
          brand: row.brand || "",
          supplierId: supplierMatch?.id || "",
          supplier: row.supplier || "",
          category: row.category || "",
          origin: row.origin ? row.origin.trim().toUpperCase() : "",
          unit: row.unit || "KG",
          storageType: row.storageType || "",
          costPrice: Number(row.costPrice || 0),
          b2bPrice: Number(row.b2bPrice || 0),
          b2cPrice: Number(row.b2cPrice || 0),
          vatRate: row.vatRate ? Number(row.vatRate) : null,
          minStock: Number(row.minStock || 0),
          barcodeNumber: row.barcodeNumber || "",
          caliber: row.caliber || "",
          description: row.description || "",
          ingredients: row.ingredients || "",
          allergens: row.allergens || "",
          packSizeG: row.packSizeG ? Number(row.packSizeG) : null,
          netWeightG: row.netWeightG ? Number(row.netWeightG) : null,
          drainedWeightG: row.drainedWeightG ? Number(row.drainedWeightG) : null,
          requiresWeighing: row.requiresWeighing === "true",
          minWeightPerUnit: row.minWeightPerUnit ? Number(row.minWeightPerUnit) : null,
          maxWeightPerUnit: row.maxWeightPerUnit ? Number(row.maxWeightPerUnit) : null,
          b2cOnly: row.b2cOnly === "true",
          trackExpiry: row.trackExpiry === "true",
          active: row.active !== "false",
          currentStock: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        imported++;
      } catch {
        failed++;
      }
    }

    showToast(`Import complete: ${imported} added${failed ? `, ${failed} failed` : ""}.`, "success");
    // Reload products
    const snap = await getDocs(collection(db, "products"));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const addOptionToList = async (field: "category" | "origin", value: string) => {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed || options[field].includes(trimmed)) return;
    const updated = [...options[field], trimmed].sort((a, b) => a.localeCompare(b));
    setOptions(prev => ({ ...prev, [field]: updated }));
    try {
      await updateDoc(doc(db, "settings", "productOptions"), { [field]: arrayUnion(trimmed) });
    } catch (err) {
      console.error("Failed to save option:", err);
    }
  };

  const saveNewProduct = async () => {
    if (!newProduct.name.trim()) { showToast("Product name is required", "warning"); return; }
    if (newProduct.requiresWeighing) {
      const minW = Number(newProduct.minWeightPerUnit || 0);
      const maxW = Number(newProduct.maxWeightPerUnit || 0);
      if (!minW || !maxW) {
        showToast("Weight range (min & max kg) is required when Requires Weighing is enabled.", "error");
        return;
      }
      if (minW >= maxW) {
        showToast("Min weight must be less than max weight.", "error");
        return;
      }
    }
    setAddingSaving(true);
    try {
      const docRef = await addDoc(collection(db, "products"), {
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
        packSizeG: newProduct.packSizeG ? Number(newProduct.packSizeG) : null,
        maxWeightPerUnit: newProduct.maxWeightPerUnit ? Number(newProduct.maxWeightPerUnit) : null,
        barcodeNumber: newProduct.barcodeNumber || "",
        vatRate: newProduct.vatRate ? Number(newProduct.vatRate) : null,
        brand: newProduct.brand || "",
        netWeightG: newProduct.netWeightG ? Number(newProduct.netWeightG) : null,
        drainedWeightG: newProduct.drainedWeightG ? Number(newProduct.drainedWeightG) : null,
        ingredients: newProduct.ingredients || "",
        allergens: newProduct.allergens || "",
        description: newProduct.description || "",
        b2cOnly: Boolean(newProduct.b2cOnly),
        b2bOnly: Boolean(newProduct.b2bOnly),
        caliber: newProduct.caliber || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      // Upload images if any were selected
      if (newProductImageFiles.length > 0) {
        try {
          if (!auth.currentUser) await signInAnonymously(auth);
          const urls: string[] = [];
          for (const file of newProductImageFiles) {
            const uniqueName = `${Date.now()}_${file.name}`;
            const storageRef = ref(storage, `products/${docRef.id}/${uniqueName}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            urls.push(url);
          }
          await updateDoc(doc(db, "products", docRef.id), { productImages: urls, productImage: urls[0] });
        } catch (imgErr) {
          console.error("Image upload failed:", imgErr);
          showToast("Product created but image upload failed", "warning");
        }
      }
      setShowAddProduct(false);
      setNewProduct({ name: "", productSubName: "", brand: "", supplierId: "", supplier: "", category: "", origin: "", unit: "KG", storageType: "", costPrice: "", b2bPrice: "", b2cPrice: "", minStock: "", active: true, requiresWeighing: false, trackExpiry: false, minWeightPerUnit: "", maxWeightPerUnit: "", packSizeG: "", barcodeNumber: "", vatRate: "", initialExpiry: "", netWeightG: "", drainedWeightG: "", ingredients: "", allergens: "", description: "", b2cOnly: false, b2bOnly: false, caliber: "" });
      setNewProductImageFiles([]);
      setNewProductImagePreviews([]);
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

  const deleteProduct = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, "products", deleteTarget.id), { deleted: true, deletedAt: now });
      setProducts(prev => prev.map(p => p.id === deleteTarget.id ? { ...p, deleted: true, deletedAt: now } : p));
      setEditing(null);
      setEditData({});
      setDeleteTarget(null);
      showToast("Moved to Trash — recoverable for 30 days", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete product", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleRestoreProducts = async (ids: Set<string>) => {
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.update(doc(db, "products", id), { deleted: false, deletedAt: null }));
      await batch.commit();
      setProducts(prev => prev.map(p => ids.has(p.id) ? { ...p, deleted: false, deletedAt: null } : p));
      showToast(`${ids.size} product${ids.size !== 1 ? "s" : ""} restored`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to restore", "error");
    }
  };

  const handlePermanentDelete = async (ids: Set<string>) => {
    if (!window.confirm(`Permanently delete ${ids.size} product${ids.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, "products", id)));
      await batch.commit();
      setProducts(prev => prev.filter(p => !ids.has(p.id)));
      setSelectedProducts(new Set());
      showToast(`${ids.size} product${ids.size !== 1 ? "s" : ""} permanently deleted`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete", "error");
    }
  };

  const saveProduct = async (id: string) => {
    // Validation: weight range is mandatory when requiresWeighing is on
    if (editData.requiresWeighing) {
      const minW = Number(editData.minWeightPerUnit || 0);
      const maxW = Number(editData.maxWeightPerUnit || 0);
      if (!minW || !maxW) {
        showToast("Weight range (min & max kg) is required when Requires Weighing is enabled.", "error");
        return;
      }
      if (minW >= maxW) {
        showToast("Min weight must be less than max weight.", "error");
        return;
      }
    }
    setSaving(id);
    const intendedActive = Boolean(editData.active);
    try {
      const { id: _, ...data } = editData;
      // supplierId and supplier name both saved
      await updateDoc(doc(db, "products", id), {
        ...data,
        active: intendedActive,
        minStock: Number(editData.minStock || 0),
        minWeightPerUnit: editData.minWeightPerUnit ? Number(editData.minWeightPerUnit) : null,
        maxWeightPerUnit: editData.maxWeightPerUnit ? Number(editData.maxWeightPerUnit) : null,
        packSizeG: editData.packSizeG ? Number(editData.packSizeG) : null,
        requiresWeighing: Boolean(editData.requiresWeighing || false),
        trackExpiry: Boolean(editData.trackExpiry || false),
        updatedAt: new Date().toISOString(),
      });

      // Verify the write actually persisted — catches silent permission errors
      // and external services (e.g. AppSheet) that immediately overwrite
      const verify = await getDoc(doc(db, "products", id));
      const verifiedActive = verify.exists() ? Boolean(verify.data()?.active) : intendedActive;
      if (verifiedActive !== intendedActive) {
        showToast(`Save conflict detected! You set "${editData.name || id}" to ${intendedActive ? "Active" : "Inactive"}, but Firestore now shows it as ${verifiedActive ? "Active" : "Inactive"}. An external service may be overwriting this field.`, "warning");
      }

      // Use the verified data from Firestore so local state is truthful
      const savedData = verify.exists() ? { id, ...verify.data() } : { ...editData };
      setProducts(prev => prev.map(p => p.id === id ? savedData : p));
      setEditing(null);
    } catch (err: any) {
      showToast(`Failed to save product: ${err.message || String(err)}`, "error");
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
      showToast("Error adding stock", "error");
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

  /* ── Bulk selection helpers ── */
  const lastSelectedIndexRef = useRef<number>(-1);
  const filteredRef = useRef<any[]>([]);

  const toggleSelectProduct = (id: string, index: number, shiftKey: boolean) => {
    setSelectedProducts(prev => {
      const n = new Set(prev);
      if (shiftKey && lastSelectedIndexRef.current >= 0) {
        const from = Math.min(lastSelectedIndexRef.current, index);
        const to   = Math.max(lastSelectedIndexRef.current, index);
        filteredRef.current.slice(from, to + 1).forEach(p => n.add(p.id));
      } else {
        n.has(id) ? n.delete(id) : n.add(id);
      }
      return n;
    });
    if (!shiftKey) lastSelectedIndexRef.current = index;
  };
  const handleBulkActivate = async () => {
    if (!selectedProducts.size) return;
    setBulkLoading(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      selectedProducts.forEach(id => batch.update(doc(db, "products", id), { active: true, updatedAt: now }));
      await batch.commit();
      setProducts(prev => prev.map(p => selectedProducts.has(p.id) ? { ...p, active: true } : p));
      setSelectedProducts(new Set());
    } finally { setBulkLoading(false); }
  };
  const handleBulkDeactivate = async () => {
    if (!selectedProducts.size) return;
    setBulkLoading(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      selectedProducts.forEach(id => batch.update(doc(db, "products", id), { active: false, updatedAt: now }));
      await batch.commit();
      setProducts(prev => prev.map(p => selectedProducts.has(p.id) ? { ...p, active: false } : p));
      setSelectedProducts(new Set());
    } finally { setBulkLoading(false); }
  };
  const handleBulkDelete = async () => {
    if (!selectedProducts.size) return;
    setBulkLoading(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      selectedProducts.forEach(id => batch.update(doc(db, "products", id), { deleted: true, deletedAt: now }));
      await batch.commit();
      const moved = selectedProducts.size;
      setProducts(prev => prev.map(p => selectedProducts.has(p.id) ? { ...p, deleted: true, deletedAt: now } : p));
      setSelectedProducts(new Set());
      showToast(`${moved} product${moved !== 1 ? "s" : ""} moved to Trash`, "success");
    } finally { setBulkLoading(false); }
  };

  const knownSupplierNames = new Set(suppliers.map(s => (s.name || "").trim().toLowerCase()).filter(Boolean));
  const uniqueSupplierNames = Array.from(
    new Set(
      products
        .map(p => p.supplier)
        .filter((s): s is string => {
          if (!s || typeof s !== "string") return false;
          const trimmed = s.trim();
          if (!trimmed) return false;
          // Hide raw Firestore IDs: short hex-like strings not matching any known supplier name
          if (/^[0-9a-f]{6,20}$/i.test(trimmed) && !knownSupplierNames.has(trimmed.toLowerCase())) return false;
          return true;
        })
    )
  ).sort() as string[];

  const trashedProducts = products
    .filter(p => p.deleted)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const filtered = products
    .filter(p => {
      if (p.deleted) return false;
      const matchesSearch =
        (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(search.toLowerCase());
      const matchesSupplier = selectedSuppliers.size === 0 || selectedSuppliers.has(p.supplier || "");
      return matchesSearch && matchesSupplier;
    })
    .sort((a, b) => {
      // Active products first, then inactive
      if ((a.active !== false) !== (b.active !== false)) {
        return (a.active !== false) ? -1 : 1;
      }
      // Then sort by name
      return (a.name || "").localeCompare(b.name || "");
    });

  filteredRef.current = filtered;
  const inactiveCount = filtered.filter(p => p.active === false).length;
  const inactiveStartIndex = filtered.findIndex(p => p.active === false);
  const isAllSelected = filtered.length > 0 && filtered.every(p => selectedProducts.has(p.id));
  const toggleSelectAll = () => {
    if (isAllSelected) setSelectedProducts(new Set());
    else setSelectedProducts(new Set(filtered.map(p => p.id)));
  };

  const storageColor: Record<string, string> = {
    Frozen: "bg-blue-100 text-blue-700",
    Refrigerated: "bg-cyan-100 text-cyan-700",
    Chilled: "bg-sky-100 text-sky-700",
    Fresh: "bg-green-100 text-green-700",
    Ambient: "bg-orange-100 text-orange-700",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Bulk Print Controls */}
      {selectedForPrint.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
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
                showToast("No products with valid EAN-13 barcodes to print", "warning");
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

      {/* Bulk Actions Bar */}
      {selectedProducts.size > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
              {selectedProducts.size} product{selectedProducts.size !== 1 ? "s" : ""} selected
            </span>
            <button onClick={() => setSelectedProducts(new Set())} className="text-xs text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300">✕ Clear</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleBulkActivate} disabled={bulkLoading}
              className="px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#1B2A5E" }}>
              Activate
            </button>
            <button onClick={handleBulkDeactivate} disabled={bulkLoading}
              className="px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#B5535A" }}>
              Deactivate
            </button>
            <button onClick={handleBulkDelete} disabled={bulkLoading}
              className="px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#7f1d1d" }}>
              🗑️ Trash
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">

          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <h1
            onClick={handleProductsHeadingClick}
            className="text-xl font-bold cursor-pointer transition-opacity hover:opacity-70"
            style={{color: "#B5535A"}}
            title="Click to scroll to top"
          >
            Products
          </h1>
          <span className="text-xs text-gray-400 dark:text-gray-400">{products.filter(p => p.active !== false).length} products</span>
        </div>
        <div className="flex items-center gap-3">
          {inactiveCount > 0 && (
            <button
              onClick={() => inactiveStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-3 py-1.5 text-xs border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 font-medium"
            >
              ↓ Inactive ({inactiveCount})
            </button>
          )}
          <button
            onClick={() => setShowOptionsFor(showOptionsFor ? null : "unit")}
            className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
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
              className="px-3 py-1.5 text-sm rounded-lg font-medium border border-[#1B2A5E] dark:border-blue-400 text-[#1B2A5E] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title="Import products from CSV"
            >
              ↑ Import CSV
            </button>
            <button
              onClick={downloadCsvTemplate}
              className="px-2 py-1.5 text-sm rounded-lg border border-[#1B2A5E] dark:border-blue-400 text-[#1B2A5E] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title="Download CSV template"
            >
              ⬇
            </button>
          </div>
          <button
            onClick={() => setShowAddProduct(true)}
            className="px-4 py-1.5 text-sm text-white rounded-lg font-medium bg-[#1B2A5E] dark:bg-blue-600 hover:bg-[#152348] dark:hover:bg-blue-700"
          >
            + Add Product
          </button>
          <SearchInput
            placeholder="Search products..."
            value={search}
            onChange={(v) => { setSearch(v); if (v) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }}
            className="w-48"
          />
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-600 rounded-lg p-0.5">
            <button
              onClick={() => { setViewMode("grid"); localStorage.setItem("dp-products-view", "grid"); setTrashView(false); }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "grid" && !trashView ? "bg-gray-900 dark:bg-gray-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
              title="Grid view"
            >⊞</button>
            <button
              onClick={() => { setViewMode("list"); localStorage.setItem("dp-products-view", "list"); setTrashView(false); }}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "list" && !trashView ? "bg-gray-900 dark:bg-gray-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
              title="List view"
            >☰</button>
            <button
              onClick={() => setTrashView(v => !v)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${trashView ? "bg-red-700 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
              title="Trash"
            >🗑️{trashedProducts.length > 0 && <span className="ml-0.5">{trashedProducts.length}</span>}</button>
          </div>
        </div>
      </div>

      {/* Options Manager */}
      {showOptionsFor && (
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 sticky top-[60px] z-20">
          <div className="flex gap-6">
            {(["unit", "storageType", "category", "origin"] as const).map(field => {
              const fieldLabel: Record<string, string> = {
                unit: "Unit",
                storageType: "Storage Type",
                category: "Category",
                origin: "Origin",
              };
              return (
              <div key={field} className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-wide">{fieldLabel[field]}</p>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(options[field] as string[]).map(val => (
                    <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs dark:text-gray-300">
                      {toTitleCase(val)}
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
                    className="flex-1 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                  <button onClick={() => addOption(field)} className="px-2 py-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs rounded">+</button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6" onMouseDown={() => { if (selectedProducts.size > 0) { setSelectedProducts(new Set()); lastSelectedIndexRef.current = -1; } }}>

        {/* ── Trash View ── */}
        {trashView && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">🗑️ Trash</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Products are permanently deleted after 30 days.</p>
              </div>
              {selectedProducts.size > 0 && (
                <div className="flex gap-2">
                  <button onClick={() => { handleRestoreProducts(selectedProducts); setSelectedProducts(new Set()); }}
                    className="px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-green-600 hover:bg-green-700">
                    ↩ Restore {selectedProducts.size}
                  </button>
                  <button onClick={() => handlePermanentDelete(selectedProducts)}
                    className="px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-red-700 hover:bg-red-800">
                    Delete Forever
                  </button>
                </div>
              )}
            </div>
            {trashedProducts.length === 0 ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">Trash is empty</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trashedProducts.map(product => {
                  const deletedAt = product.deletedAt ? new Date(product.deletedAt) : null;
                  const daysLeft = deletedAt ? Math.max(0, 30 - Math.floor((Date.now() - deletedAt.getTime()) / 86400000)) : 30;
                  const isSelected = selectedProducts.has(product.id);
                  return (
                    <div key={product.id}
                      onMouseDown={(e) => { e.stopPropagation(); toggleSelectProduct(product.id, 0, e.shiftKey); }}
                      className={`relative select-none cursor-pointer bg-white dark:bg-gray-800 rounded-lg border transition-colors opacity-60 hover:opacity-80 ${isSelected ? "border-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800" : "border-gray-200 dark:border-gray-700"}`}>
                      <div className="absolute top-2 left-2 z-10" onMouseDown={e => e.stopPropagation()}>
                        <button onMouseDown={(e) => { e.stopPropagation(); toggleSelectProduct(product.id, 0, e.shiftKey); }}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white dark:bg-gray-800/60 border-gray-300 dark:border-gray-500"}`}>
                          {isSelected && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        </button>
                      </div>
                      <div className="h-32 flex items-center justify-center overflow-hidden rounded-t-lg bg-gray-50 dark:bg-gray-700/50">
                        <ProductImage src={product.productImage} alt={product.name} className="max-h-28 max-w-full object-contain" />
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{product.supplier || "—"}</p>
                        <p className={`text-xs mt-1 font-medium ${daysLeft <= 3 ? "text-red-500" : "text-amber-500"}`}>
                          {daysLeft === 0 ? "Deletes today" : `${daysLeft}d left`}
                        </p>
                      </div>
                      <div className="flex gap-2 px-3 pb-3" onMouseDown={e => e.stopPropagation()}>
                        <button onClick={() => handleRestoreProducts(new Set([product.id]))}
                          className="flex-1 text-xs py-1.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 font-medium">
                          ↩ Restore
                        </button>
                        <button onClick={() => handlePermanentDelete(new Set([product.id]))}
                          className="flex-1 text-xs py-1.5 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium">
                          Delete Forever
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!trashView && viewMode === "list" && !loading && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2 w-8">
                    <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-2 w-12"></th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Supplier</th>
                  <th className="text-right px-4 py-2">Stock / Min</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((product, index) => {
                  const isLowStock = Number(product.minStock) > 0 && Number(product.currentStock || 0) > 0 && Number(product.currentStock || 0) < Number(product.minStock);
                  return (
                    <tr
                      key={product.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const tag = (e.target as HTMLElement).tagName;
                        if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return;
                        if (e.shiftKey) e.preventDefault(); // prevent text selection
                        toggleSelectProduct(product.id, index, e.shiftKey);
                      }}
                      className={`cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/30 ${selectedProducts.has(product.id) ? "bg-indigo-50/60 dark:bg-indigo-950/20" : ""} ${product.active === false ? "opacity-50" : ""} ${isLowStock ? "border-l-4 border-orange-400" : ""}`}
                    >
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedProducts.has(product.id)}
                          onChange={() => {}}
                          onMouseDown={(e) => { e.stopPropagation(); if (e.shiftKey) e.preventDefault(); toggleSelectProduct(product.id, index, e.shiftKey); }}
                          className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                          <ProductImage src={product.productImage} alt={product.name} className="w-full h-full object-contain" />
                          {!product.productImage && <span className="text-lg">📦</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-semibold text-gray-900 dark:text-white capitalize">{product.name}</p>
                        {product.productSubName && product.productSubName !== "0" && <p className="text-xs text-gray-400">{product.productSubName}</p>}
                        {Number(product.currentStock || 0) === 0
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded mt-0.5">✕ Out of Stock</span>
                          : isLowStock
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded mt-0.5">⚠ Low Stock</span>
                          : null}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`text-sm font-semibold ${Number(product.currentStock || 0) === 0 ? "text-red-600 dark:text-red-400" : isLowStock ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-white"}`}>
                          {formatQty(product.currentStock)}
                        </span>
                        <span className="text-xs text-gray-400"> / {product.minStock || "—"}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${product.active !== false ? "bg-blue-100 text-blue-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                          {product.active !== false ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(product)} className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium dark:text-gray-300">Edit</button>
                          <button onClick={() => { setStockInProduct(product); setStockInQty(""); setStockInNotes(""); setStockInExpiry(""); }} className="px-2 py-1 text-xs border border-green-300 text-green-700 rounded hover:bg-green-50 font-medium">+Stock</button>
                          <button onClick={() => loadHistory(product)} className="px-2 py-1 text-xs border border-blue-300 text-blue-700 rounded hover:bg-blue-50 font-medium">History</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className={trashView || viewMode === "list" ? "hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"} onMouseDown={(e) => { if (e.target === e.currentTarget && selectedProducts.size > 0) { setSelectedProducts(new Set()); lastSelectedIndexRef.current = -1; } }}>
          {filtered.map((product, index) => {
            const isLowStock = Number(product.minStock) > 0 && Number(product.currentStock || 0) < Number(product.minStock);
            return (
            <div
              key={product.id}
              ref={index === inactiveStartIndex && inactiveStartIndex !== -1 ? inactiveStartRef : null}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (editing === product.id) return;
                const tag = (e.target as HTMLElement).tagName;
                if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
                if (e.shiftKey) e.preventDefault(); // prevent text selection
                toggleSelectProduct(product.id, index, e.shiftKey);
              }}
              className={`relative select-none cursor-pointer bg-white dark:bg-gray-800 rounded-lg border transition-colors ${isLowStock && editing !== product.id ? "border-l-4 border-l-orange-400" : ""} ${
              editing === product.id ? "border-blue-300 bg-blue-50 dark:bg-blue-900/20" : selectedProducts.has(product.id) ? "border-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            } ${product.active === false ? "opacity-50" : ""}`}>
              {/* Bulk select checkbox */}
              {editing !== product.id && (
                <div className="absolute top-2 left-2 z-10" onMouseDown={e => e.stopPropagation()}>
                  <button
                    onMouseDown={(e) => { e.stopPropagation(); if (e.shiftKey) e.preventDefault(); toggleSelectProduct(product.id, index, e.shiftKey); }}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      selectedProducts.has(product.id)
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white dark:bg-gray-800/60 border-gray-300 dark:border-gray-500 hover:border-indigo-400"
                    }`}
                  >
                    {selectedProducts.has(product.id) && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {editing === product.id ? (
                /* EDIT MODE */
                <div className="space-y-3">
                  {/* Multi-photo gallery in edit mode */}
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-t-lg p-2">
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" multiple
                      onChange={e => { if (e.target.files) { Array.from(e.target.files).forEach(f => handleImageUpload(product.id, f)); e.target.value = ""; } }} />
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(() => {
                        const imgs: string[] = editData.productImages || (editData.productImage ? [editData.productImage] : []);
                        return imgs.map((url: string, idx: number) => (
                          <div key={url} className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                            <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-contain bg-white dark:bg-gray-800" />
                            {idx === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">Main</span>}
                            <button
                              onClick={() => handleImageDelete(product.id, url)}
                              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            >×</button>
                          </div>
                        ));
                      })()}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage === product.id}
                        className="shrink-0 w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {uploadingImage === product.id ? <span className="text-xs">⏳</span> : <><span className="text-2xl">+</span><span className="text-[10px] font-medium">Add Photo</span></>}
                      </button>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <input value={editData.name || ""} onChange={e => setEditData((p: any) => ({ ...p, name: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <input value={editData.productSubName || ""} onChange={e => setEditData((p: any) => ({ ...p, productSubName: e.target.value }))}
                    placeholder="Sub name..." className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />

                  {/* Supplier searchable dropdown */}
                  <div className="relative">
                    <div
                      onClick={() => { setSupplierDropdownOpen(o => !o); setSupplierSearch(""); }}
                      className="w-full flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer hover:border-gray-400"
                    >
                      <span className={(editData.supplierId || editData.supplier) ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                        {editData.supplierId
                          ? (suppliers.find((s:any) => s.id === editData.supplierId)?.name || editData.supplier || "— Supplier —")
                          : (editData.supplier || "— Supplier —")}
                      </span>
                      <span className="text-gray-400 text-xs">{supplierDropdownOpen ? "▲" : "▼"}</span>
                    </div>
                    {supplierDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => { setSupplierDropdownOpen(false); setSupplierSearch(""); }} />
                        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden" style={{ minWidth: "220px" }}>
                          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search suppliers..."
                              value={supplierSearch}
                              onChange={e => setSupplierSearch(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {(editData.supplierId || editData.supplier) && (
                              <div
                                onClick={() => { setEditData((p: any) => ({ ...p, supplierId: "", supplier: "" })); setSupplierDropdownOpen(false); setSupplierSearch(""); }}
                                className="px-3 py-2 text-xs cursor-pointer text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-700"
                              >
                                <span>✕</span> Clear supplier
                              </div>
                            )}
                            {suppliers
                              .filter((s:any) => (s.name || "").toLowerCase().includes(supplierSearch.toLowerCase()))
                              .map((s:any) => (
                                <div
                                  key={s.id}
                                  onClick={() => { setEditData((p: any) => ({ ...p, supplierId: s.id, supplier: s.name })); setSupplierDropdownOpen(false); setSupplierSearch(""); }}
                                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${s.id === editData.supplierId ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-800 dark:text-gray-200"}`}
                                >
                                  {s.name}
                                </div>
                              ))}
                            {suppliers.filter((s:any) => (s.name || "").toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                              <div className="px-3 py-3 text-xs text-gray-400 text-center">No suppliers found</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <SearchableSelect
                      value={editData.category || ""}
                      onChange={v => setEditData((p: any) => ({ ...p, category: v }))}
                      options={options.category}
                      placeholder="Category"
                      size="xs"
                      allowCustom
                      onAddOption={v => addOptionToList("category", v)}
                    />
                    <SearchableSelect
                      value={editData.origin || ""}
                      onChange={v => setEditData((p: any) => ({ ...p, origin: v }))}
                      options={options.origin}
                      placeholder="Origin"
                      size="xs"
                      allowCustom
                      onAddOption={v => addOptionToList("origin", v)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <SearchableSelect
                      value={editData.unit || ""}
                      onChange={v => setEditData((p: any) => ({ ...p, unit: v }))}
                      options={options.unit}
                      placeholder="Unit"
                      size="xs"
                    />
                    <SearchableSelect
                      value={editData.storageType || ""}
                      onChange={v => setEditData((p: any) => ({ ...p, storageType: v }))}
                      options={options.storageType}
                      placeholder="Storage"
                      size="xs"
                    />
                  </div>

                  {/* Product Details Section */}
                  <div className="border-t dark:border-gray-700 pt-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Product Details</p>
                    <input value={editData.brand || ""} onChange={e => setEditData((p: any) => ({ ...p, brand: e.target.value }))}
                      placeholder="Brand (e.g. Los Peperetes)" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Caliber / Count</label>
                      <input value={editData.caliber || ""} onChange={e => setEditData((p: any) => ({ ...p, caliber: e.target.value }))}
                        placeholder="e.g. 21/30, U10, 13/16" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Net Weight (g)</label>
                        <input type="number" value={editData.netWeightG || ""} onChange={e => setEditData((p: any) => ({ ...p, netWeightG: e.target.value }))}
                          placeholder="e.g. 120" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Drained Weight (g)</label>
                        <input type="number" value={editData.drainedWeightG || ""} onChange={e => setEditData((p: any) => ({ ...p, drainedWeightG: e.target.value }))}
                          placeholder="e.g. 85" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      {!editData.requiresWeighing && (
                        <div className="col-span-2">
                          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">📦 Pack Size (g) <span className="font-normal text-gray-400">— for fixed-weight packs (e.g. 120g jar)</span></label>
                          <input type="number" step="1" min="0" placeholder="e.g. 120"
                            value={editData.packSizeG || ""}
                            onChange={e => setEditData((p: any) => ({ ...p, packSizeG: e.target.value }))}
                            className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                          {editData.packSizeG && Number(editData.packSizeG) > 0 && editData.b2cPrice > 0 && (
                            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mt-1">
                              B2C price per pack: ${formatPrice(editData.b2cPrice * Number(editData.packSizeG) / 1000)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <textarea value={editData.ingredients || ""} onChange={e => setEditData((p: any) => ({ ...p, ingredients: e.target.value }))}
                      placeholder="Ingredients..." rows={2}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
                    <input value={editData.allergens || ""} onChange={e => setEditData((p: any) => ({ ...p, allergens: e.target.value }))}
                      placeholder="Allergens (e.g. Fish, Shellfish)" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    <textarea value={editData.description || ""} onChange={e => setEditData((p: any) => ({ ...p, description: e.target.value }))}
                      placeholder="Description..." rows={2}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Barcode</label>
                      <input value={editData.barcodeNumber || ""} onChange={e => setEditData((p: any) => ({ ...p, barcodeNumber: e.target.value }))}
                        placeholder="Enter or generate..." className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                    <button onClick={() => {
                      const newBarcode = generateBarcode();
                      setEditData((p: any) => ({ ...p, barcodeNumber: newBarcode }));
                    }}
                      className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600 font-medium">
                      Generate
                    </button>
                  </div>

                  {editData.barcodeNumber && /^\d{13}$/.test(String(editData.barcodeNumber).trim()) && (
                    <div className="flex flex-col items-center gap-2">
                      <BarcodeDisplay barcodeNumber={editData.barcodeNumber} size="md" showNumber={true} />
                      <button
                        onClick={() => printSingleBarcode(editData)}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
                      >
                        🖨️ Print Label
                      </button>
                    </div>
                  )}
                  {editData.barcodeNumber && !/^\d{13}$/.test(String(editData.barcodeNumber).trim()) && <div className="text-xs text-red-500 font-medium">⚠️ Invalid barcode (must be 13 digits). Click Generate for a valid EAN-13.</div>}

                  <div className="border-t dark:border-gray-700 pt-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Cost</label>
                        <input type="number" value={editData.costPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, costPrice: e.target.value }))}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">B2B</label>
                        <input type="number" value={editData.b2bPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2bPrice: e.target.value }))}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        {editData.costPrice > 0 && editData.b2bPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                            {((editData.b2bPrice - editData.costPrice) / editData.b2bPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">B2C</label>
                        <input type="number" value={editData.b2cPrice || ""} onChange={e => setEditData((p: any) => ({ ...p, b2cPrice: e.target.value }))}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                        {editData.costPrice > 0 && editData.b2cPrice > 0 && (
                          <div className={`text-xs mt-1 font-medium ${((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                            {((editData.b2cPrice - editData.costPrice) / editData.b2cPrice * 100).toFixed(0)}% margin
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">VAT Rate (%)</label>
                      <input type="number" value={editData.vatRate || ""} onChange={e => setEditData((p: any) => ({ ...p, vatRate: e.target.value }))}
                        placeholder="Empty = exempt" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Leave empty for exempt</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Min Stock</label>
                      <input type="number" value={editData.minStock || ""} onChange={e => setEditData((p: any) => ({ ...p, minStock: e.target.value }))}
                        placeholder="0" className="w-full border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={editData.active !== false} onChange={e => setEditData((p: any) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
                        <span>Active</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:text-gray-300">
                      <div onClick={() => setEditData((p: any) => ({ ...p, requiresWeighing: !p.requiresWeighing }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.requiresWeighing ? "bg-blue-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.requiresWeighing ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium">⚖️ Requires Weighing</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:text-gray-300">
                      <div onClick={() => setEditData((p: any) => ({ ...p, trackExpiry: !p.trackExpiry }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.trackExpiry ? "bg-orange-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.trackExpiry ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium">📦 FIFO / Track Expiry</span>
                    </label>
                    <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 dark:text-purple-300">
                      <div onClick={() => setEditData((p: any) => ({ ...p, b2cOnly: !p.b2cOnly }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.b2cOnly ? "bg-purple-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.b2cOnly ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium text-purple-700 dark:text-purple-300">🛍️ B2C Only — hide from wholesale orders</span>
                    </label>
                    <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:text-blue-300">
                      <div onClick={() => setEditData((p: any) => ({ ...p, b2bOnly: !p.b2bOnly }))}
                        className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 flex items-center px-0.5 cursor-pointer ${editData.b2bOnly ? "bg-blue-500" : "bg-gray-300"}`}>
                        <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${editData.b2bOnly ? "translate-x-4" : "translate-x-0"}`} />
                      </div>
                      <span className="font-medium text-blue-700 dark:text-blue-300">🏢 B2B Only — hide from retail orders</span>
                    </label>
                  </div>
                  {editData.requiresWeighing && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">⚖️ Weight range per unit (g) <span className="text-red-500">*</span></p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min (g)</label>
                          <input type="number" step="1" min="0" placeholder="e.g. 800"
                            value={editData.minWeightPerUnit || ""}
                            onChange={e => setEditData((p: any) => ({ ...p, minWeightPerUnit: e.target.value }))}
                            className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!editData.minWeightPerUnit ? "border-red-300 dark:border-red-600" : "border-amber-200 dark:border-amber-700"}`} />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Max (g)</label>
                          <input type="number" step="1" min="0" placeholder="e.g. 1400"
                            value={editData.maxWeightPerUnit || ""}
                            onChange={e => setEditData((p: any) => ({ ...p, maxWeightPerUnit: e.target.value }))}
                            className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!editData.maxWeightPerUnit ? "border-red-300 dark:border-red-600" : "border-amber-200 dark:border-amber-700"}`} />
                        </div>
                      </div>
                      <p className="text-xs text-amber-600 dark:text-amber-400">Weight range used when building orders.</p>
                    </div>
                  )}
                  {editData.trackExpiry && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-lg p-3">
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                        📅 Next Expiry Date <span className="text-gray-400 dark:text-gray-500">(set per batch when adding stock)</span>
                      </label>
                      <input type="date" value={editData.nextExpiryDate || ""}
                        onChange={e => setEditData((p: any) => ({ ...p, nextExpiryDate: e.target.value }))}
                        className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Expiry is required each time you receive stock via +Stock.</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button onClick={() => saveProduct(product.id)} disabled={saving === product.id}
                      className="flex-1 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs rounded hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 font-medium">
                      {saving === product.id ? "..." : "Save"}
                    </button>
                    <button onClick={cancelEdit} className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium">
                      Cancel
                    </button>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteProduct(product.id, product.name)}
                      disabled={saving === product.id}
                      className="w-full mt-1 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 py-1"
                    >
                      🗑 Delete Product
                    </button>
                  )}
                </div>
                </div>
              ) : (
                /* VIEW MODE */
                <div className="space-y-3">
                  {(() => {
                    const imgs: string[] = product.productImages?.length ? product.productImages : (product.productImage ? [product.productImage] : []);
                    const cardImgIdx = cardImageIndexes[product.id] ?? 0;
                    const current = imgs[cardImgIdx] || null;
                    return (
                      <div className="h-32 bg-white dark:bg-gray-800 rounded-t-lg overflow-hidden flex items-center justify-center relative">
                        {current ? (
                          <img src={current} alt={product.name} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <div className="text-gray-400 dark:text-gray-500 text-center">
                            <div className="text-3xl mb-1">📦</div>
                            <div className="text-xs">No image</div>
                          </div>
                        )}
                        {/* Prev arrow */}
                        {imgs.length > 1 && (
                          <button
                            className="absolute left-1 top-1/2 -translate-y-1/2 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm leading-none z-10"
                            style={{ backgroundColor: "#1B2A5E" }}
                            onClick={e => { e.stopPropagation(); setCardImageIndexes(prev => ({ ...prev, [product.id]: (cardImgIdx - 1 + imgs.length) % imgs.length })); }}
                          >‹</button>
                        )}
                        {/* Next arrow */}
                        {imgs.length > 1 && (
                          <button
                            className="absolute right-1 top-1/2 -translate-y-1/2 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm leading-none z-10"
                            style={{ backgroundColor: "#1B2A5E" }}
                            onClick={e => { e.stopPropagation(); setCardImageIndexes(prev => ({ ...prev, [product.id]: (cardImgIdx + 1) % imgs.length })); }}
                          >›</button>
                        )}
                        {/* Dot indicators */}
                        {imgs.length > 1 && (
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                            {imgs.map((_, idx) => (
                              <button
                                key={idx}
                                onClick={e => { e.stopPropagation(); setCardImageIndexes(prev => ({ ...prev, [product.id]: idx })); }}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === cardImgIdx ? "bg-white" : "bg-white/40"}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{toTitleCase(product.name)}</h3>
                      {product.productSubName && product.productSubName !== "0" && <p className="text-xs text-gray-500 dark:text-gray-400">{toTitleCase(product.productSubName)}</p>}
                      {(!product.productSubName || product.productSubName === "0") && (product.netWeightG || product.packSizeG || product.drainedWeightG || product.caliber) && (
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                          {[
                            product.packSizeG ? `${product.packSizeG}g` : null,
                            product.netWeightG && !product.packSizeG ? `${product.netWeightG}g net` : null,
                            product.drainedWeightG ? `${product.drainedWeightG}g drained` : null,
                            product.caliber ? `cal. ${product.caliber}` : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                          (Number(product.currentStock || 0) === 0 || (Number(product.minStock) > 0 && Number(product.currentStock || 0) < Number(product.minStock))) ? "bg-red-100 text-red-700" :
                          (Number(product.minStock) > 0 && Number(product.currentStock || 0) === Number(product.minStock)) ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        }`}>
                          {formatQty(product.currentStock)} {product.unit || ""}
                        </span>
                        <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                          product.active !== false ? "bg-blue-100 text-blue-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                        }`}>
                          {product.active !== false ? "✓ Active" : "○ Inactive"}
                        </span>
                        {product.b2cOnly && (
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            🛍️ B2C Only
                          </span>
                        )}
                        {product.b2bOnly && (
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                            🏢 B2B Only
                          </span>
                        )}
                        {Number(product.currentStock || 0) === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">✕ Out of Stock</span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">⚠ Low Stock</span>
                        ) : null}
                      </div>
                    </div>

                  <div className="flex flex-wrap gap-2">
                    {product.caliber && <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#EEF1F8", color: "#1B2A5E" }}>📏 {product.caliber}</span>}
                    {product.packSizeG && <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#EEF8EE", color: "#166534" }}>📦 {product.packSizeG}g</span>}
                    {product.netWeightG && !product.packSizeG && <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: "#EEF8EE", color: "#166534" }}>⚖ {product.netWeightG}g net</span>}
                    {product.drainedWeightG && <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-50 text-amber-700">🫙 {product.drainedWeightG}g drained</span>}
                    {product.category && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">{toTitleCase(product.category)}</span>}
                    {product.origin && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">{toTitleCase(product.origin)}</span>}
                    {product.supplier && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">🏭 {toTitleCase(product.supplier)}</span>}
                    {product.brand && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">🏷️ {toTitleCase(product.brand)}</span>}
                  </div>

                  {product.barcodeNumber && (
                    <>
                      <button
                        onClick={() => toggleSection(product.id, 'barcode')}
                        className="w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-t dark:border-gray-700 flex items-center gap-2"
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

                  {product.requiresWeighing && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
                      ⚖️ {product.minWeightPerUnit && product.maxWeightPerUnit
                        ? `${product.minWeightPerUnit}–${product.maxWeightPerUnit} g`
                        : "⚠️ Set weight range"}
                    </span>
                  )}
                  {product.trackExpiry && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                      📅 Track expiry
                    </span>
                  )}

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

                  <div className="grid grid-cols-2 gap-2 text-sm border-t dark:border-gray-700 pt-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Stock</p>
                      <p className={
                        (Number(product.currentStock || 0) === 0 || (Number(product.minStock) > 0 && Number(product.currentStock || 0) < Number(product.minStock))) ? "text-red-600 font-semibold" :
                        (Number(product.minStock) > 0 && Number(product.currentStock || 0) === Number(product.minStock)) ? "text-yellow-600 font-semibold" :
                        "text-gray-900 dark:text-white"
                      }>
                        {formatQty(product.currentStock)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Min</p>
                      <p className="text-gray-900 dark:text-white">{product.minStock || "—"}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleSection(product.id, 'pricing')}
                    className="w-full text-left py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-t dark:border-gray-700 flex items-center gap-2"
                  >
                    {expandedSections.pricing.has(product.id) ? '▼' : '▶'} Pricing & Margins
                  </button>

                  {expandedSections.pricing.has(product.id) && (() => {
                    const isWeigh = product.requiresWeighing;
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2 py-2">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cost{isWeigh ? " /kg" : ""}</p>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">${formatPrice(product.costPrice || 0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">B2B{isWeigh ? " /kg" : ""}</p>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">${formatPrice(product.b2bPrice || 0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">B2C{isWeigh ? " /kg" : ""}</p>
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">${formatPrice(product.b2cPrice || 0)}</p>
                          </div>
                        </div>

                        {product.costPrice > 0 && (
                          <div className="space-y-2 py-2 border-t dark:border-gray-700">
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">B2B Margin</p>
                              {product.b2bPrice > 0 ? (
                                <div className={`text-sm font-semibold ${((product.b2bPrice - product.costPrice) / product.b2bPrice * 100) < 10 ? "text-red-600" : "text-blue-600"}`}>
                                  {((product.b2bPrice - product.costPrice) / product.b2bPrice * 100).toFixed(1)}%
                                </div>
                              ) : <p className="text-xs text-gray-400 dark:text-gray-500">No price set</p>}
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">B2C Margin</p>
                              {product.b2cPrice > 0 ? (
                                <div className={`text-sm font-semibold ${((product.b2cPrice - product.costPrice) / product.b2cPrice * 100) < 15 ? "text-red-600" : "text-green-600"}`}>
                                  {((product.b2cPrice - product.costPrice) / product.b2cPrice * 100).toFixed(1)}%
                                </div>
                              ) : <p className="text-xs text-gray-400 dark:text-gray-500">No price set</p>}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="flex gap-2">
                    <button onClick={() => startEdit(product)} className="flex-1 px-2 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium dark:text-gray-300">
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
                            : "border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        }`}>
                        {selectedForPrint.has(product.id) ? "✓ Selected" : "Select"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
      {/* Stock History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Stock History</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{historyProduct.name}</p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">×</button>
            </div>
            {historyLoading ? (
              <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">Loading...</div>
            ) : historyMovements.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">No movements found</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase">
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-left px-3 py-2">Notes</th>
                      <th className="text-left px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {historyMovements.map((m: any) => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.movementType === "In" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {m.movementType === "In" ? "↑ In" : "↓ Out"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium dark:text-gray-200">{formatQty(m.quantity)}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{m.source || "—"}</td>
                        <td className="px-3 py-2 text-gray-400 dark:text-gray-500">{m.notes || "—"}</td>
                        <td className="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">
                          {m.createdAt?.seconds ? new Date(m.createdAt.seconds * 1000).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <span className="text-xs text-gray-500 dark:text-gray-400">Current stock: <span className="font-semibold text-gray-900 dark:text-white">{formatQty(historyProduct.currentStock)}</span></span>
              <button onClick={() => setHistoryProduct(null)} className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {/* Photo Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300 z-10" onClick={() => setLightbox(null)}>×</button>
          {/* Prev */}
          {lightbox.images.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl leading-none hover:text-gray-300 z-10 px-3 py-1"
              onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, index: (l.index - 1 + l.images.length) % l.images.length } : null); }}
            >‹</button>
          )}
          {/* Main image */}
          <div className="max-w-3xl max-h-[80vh] flex flex-col items-center gap-4 px-16" onClick={e => e.stopPropagation()}>
            <img
              src={lightbox.images[lightbox.index]}
              alt={`Photo ${lightbox.index + 1}`}
              className="max-w-full max-h-[65vh] object-contain rounded-lg"
            />
            {/* Thumbnail strip */}
            {lightbox.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {lightbox.images.map((url, idx) => (
                  <button
                    key={url}
                    onClick={() => setLightbox(l => l ? { ...l, index: idx } : null)}
                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${idx === lightbox.index ? "border-white" : "border-gray-600 hover:border-gray-400"}`}
                  >
                    <img src={url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-contain bg-gray-900" />
                  </button>
                ))}
              </div>
            )}
            <p className="text-gray-400 text-sm">{lightbox.index + 1} / {lightbox.images.length}</p>
          </div>
          {/* Next */}
          {lightbox.images.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl leading-none hover:text-gray-300 z-10 px-3 py-1"
              onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, index: (l.index + 1) % l.images.length } : null); }}
            >›</button>
          )}
        </div>
      )}

      {showAddProduct && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add New Product</h3>
              <button onClick={() => { setShowAddProduct(false); setNewProductImageFiles([]); setNewProductImagePreviews([]); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Product Name *</label>
                  <input value={newProduct.name} onChange={e => setNewProduct((p:any) => ({...p, name: e.target.value}))}
                    placeholder="e.g. Octopus Cooked Skin" autoFocus
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sub Name</label>
                  <input value={newProduct.productSubName} onChange={e => setNewProduct((p:any) => ({...p, productSubName: e.target.value}))}
                    placeholder="e.g. Scientific name or French name"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Brand</label>
                  <input value={newProduct.brand} onChange={e => setNewProduct((p:any) => ({...p, brand: e.target.value}))}
                    placeholder="e.g. Los Peperetes"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Caliber / Count</label>
                  <input value={newProduct.caliber} onChange={e => setNewProduct((p:any) => ({...p, caliber: e.target.value}))}
                    placeholder="e.g. 21/30, U10, 13/16"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Net Weight (g)</label>
                  <input type="number" value={newProduct.netWeightG} onChange={e => setNewProduct((p:any) => ({...p, netWeightG: e.target.value}))}
                    placeholder="e.g. 120"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Drained Weight (g)</label>
                  <input type="number" value={newProduct.drainedWeightG} onChange={e => setNewProduct((p:any) => ({...p, drainedWeightG: e.target.value}))}
                    placeholder="e.g. 85"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                {!newProduct.requiresWeighing && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">📦 Pack Size (g)</label>
                    <input type="number" step="1" min="0" placeholder="e.g. 120"
                      value={newProduct.packSizeG || ""}
                      onChange={e => setNewProduct((p: any) => ({ ...p, packSizeG: e.target.value }))}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    {newProduct.packSizeG && Number(newProduct.packSizeG) > 0 && Number(newProduct.b2cPrice) > 0 && (
                      <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mt-1">
                        B2C price per pack: ${formatPrice(Number(newProduct.b2cPrice) * Number(newProduct.packSizeG) / 1000)}
                      </p>
                    )}
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Ingredients</label>
                  <textarea value={newProduct.ingredients} onChange={e => setNewProduct((p:any) => ({...p, ingredients: e.target.value}))}
                    placeholder="e.g. Octopus, olive oil, salt" rows={2}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Allergens</label>
                  <input value={newProduct.allergens} onChange={e => setNewProduct((p:any) => ({...p, allergens: e.target.value}))}
                    placeholder="e.g. Fish, Shellfish, Molluscs"
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Description</label>
                  <textarea value={newProduct.description} onChange={e => setNewProduct((p:any) => ({...p, description: e.target.value}))}
                    placeholder="Short product description..." rows={2}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none" />
                </div>
                {/* Product Photo */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Product Photo</label>
                  <input
                    ref={newProductImageRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setNewProductImageFiles(prev => [...prev, ...files]);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = ev => setNewProductImagePreviews(prev => [...prev, ev.target?.result as string]);
                        reader.readAsDataURL(file);
                      });
                      e.target.value = "";
                    }}
                  />
                  <div className="flex gap-2 flex-wrap">
                    {newProductImagePreviews.map((preview, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group">
                        <img src={preview} alt={`Photo ${idx + 1}`} className="w-full h-full object-contain bg-gray-50 dark:bg-gray-900" />
                        {idx === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">Main</span>}
                        <button
                          type="button"
                          onClick={() => {
                            setNewProductImageFiles(prev => prev.filter((_, i) => i !== idx));
                            setNewProductImagePreviews(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >×</button>
                      </div>
                    ))}
                    <div
                      onClick={() => newProductImageRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      <span className="text-xl">📷</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium text-center leading-tight">Add Photo</span>
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Supplier</label>
                  <div className="relative">
                    <div
                      onClick={() => { setNewProductSupplierDropdownOpen(o => !o); setNewProductSupplierSearch(""); }}
                      className="w-full flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer hover:border-gray-400"
                    >
                      <span className={newProduct.supplierId ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                        {newProduct.supplierId ? (suppliers.find((s:any) => s.id === newProduct.supplierId)?.name || "— Select Supplier —") : "— Select Supplier —"}
                      </span>
                      <span className="text-gray-400 text-xs">{newProductSupplierDropdownOpen ? "▲" : "▼"}</span>
                    </div>
                    {newProductSupplierDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => { setNewProductSupplierDropdownOpen(false); setNewProductSupplierSearch(""); }} />
                        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search suppliers..."
                              value={newProductSupplierSearch}
                              onChange={e => setNewProductSupplierSearch(e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="max-h-52 overflow-y-auto">
                            {newProduct.supplierId && (
                              <div
                                onClick={() => { setNewProduct((p:any) => ({ ...p, supplierId: "", supplier: "" })); setNewProductSupplierDropdownOpen(false); setNewProductSupplierSearch(""); }}
                                className="px-3 py-2 text-sm cursor-pointer text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-700"
                              >
                                <span>✕</span> Clear supplier
                              </div>
                            )}
                            {suppliers
                              .filter((s:any) => (s.name || "").toLowerCase().includes(newProductSupplierSearch.toLowerCase()))
                              .map((s:any) => (
                                <div
                                  key={s.id}
                                  onClick={() => { setNewProduct((p:any) => ({ ...p, supplierId: s.id, supplier: s.name })); setNewProductSupplierDropdownOpen(false); setNewProductSupplierSearch(""); }}
                                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${s.id === newProduct.supplierId ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-800 dark:text-gray-200"}`}
                                >
                                  {s.name}
                                </div>
                              ))}
                            {suppliers.filter((s:any) => (s.name || "").toLowerCase().includes(newProductSupplierSearch.toLowerCase())).length === 0 && (
                              <div className="px-3 py-3 text-sm text-gray-400 text-center">No suppliers found</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Category</label>
                  <SearchableSelect
                    value={newProduct.category}
                    onChange={v => setNewProduct((p:any) => ({ ...p, category: v }))}
                    options={options.category}
                    placeholder="— Category —"
                    size="sm"
                    allowCustom
                    onAddOption={v => addOptionToList("category", v)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Origin</label>
                  <SearchableSelect
                    value={newProduct.origin}
                    onChange={v => setNewProduct((p:any) => ({ ...p, origin: v }))}
                    options={options.origin}
                    placeholder="— Origin —"
                    size="sm"
                    allowCustom
                    onAddOption={v => addOptionToList("origin", v)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Unit</label>
                  <SearchableSelect
                    value={newProduct.unit}
                    onChange={v => setNewProduct((p:any) => ({ ...p, unit: v }))}
                    options={options.unit}
                    placeholder="— Unit —"
                    size="sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Storage Type</label>
                  <SearchableSelect
                    value={newProduct.storageType}
                    onChange={v => setNewProduct((p:any) => ({ ...p, storageType: v }))}
                    options={options.storageType}
                    placeholder="— Storage Type —"
                    size="sm"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Barcode</label>
                      <input value={newProduct.barcodeNumber} onChange={e => setNewProduct((p:any) => ({...p, barcodeNumber: e.target.value}))}
                        placeholder="Enter supplier barcode or leave empty to generate"
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <button onClick={() => {
                      const newBarcode = generateBarcode();
                      setNewProduct((p:any) => ({...p, barcodeNumber: newBarcode}));
                    }}
                      className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium whitespace-nowrap">
                      Generate
                    </button>
                  </div>
                  {newProduct.barcodeNumber && /^\d{13}$/.test(String(newProduct.barcodeNumber).trim()) && (
                    <div className="mt-2 flex justify-center p-2 bg-white border border-gray-100 dark:border-gray-700 rounded-lg">
                      <BarcodeDisplay barcodeNumber={newProduct.barcodeNumber} size="sm" showNumber={true} />
                    </div>
                  )}
                  {newProduct.barcodeNumber && !/^\d{13}$/.test(String(newProduct.barcodeNumber).trim()) && <div className="text-xs text-red-500 font-medium mt-1">⚠️ Invalid barcode (must be 13 digits)</div>}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Cost Price ($)</label>
                  <input type="number" value={newProduct.costPrice} onChange={e => setNewProduct((p:any) => ({...p, costPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min Stock</label>
                  <input type="number" value={newProduct.minStock} onChange={e => setNewProduct((p:any) => ({...p, minStock: e.target.value}))}
                    placeholder="0" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">B2B Price ($)</label>
                  <input type="number" value={newProduct.b2bPrice} onChange={e => setNewProduct((p:any) => ({...p, b2bPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  {Number(newProduct.b2bPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100) < 10 ? "text-red-500" : "text-blue-600"}`}>
                      Margin: {((Number(newProduct.b2bPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2bPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">B2C Price ($)</label>
                  <input type="number" value={newProduct.b2cPrice} onChange={e => setNewProduct((p:any) => ({...p, b2cPrice: e.target.value}))}
                    placeholder="0.00" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  {Number(newProduct.b2cPrice) > 0 && Number(newProduct.costPrice) > 0 && (
                    <p className={`text-xs mt-1 font-medium ${((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100) < 15 ? "text-red-500" : "text-green-600"}`}>
                      Margin: {((Number(newProduct.b2cPrice) - Number(newProduct.costPrice)) / Number(newProduct.b2cPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">VAT Rate (%)</label>
                  <input type="number" value={newProduct.vatRate} onChange={e => setNewProduct((p:any) => ({...p, vatRate: e.target.value}))}
                    placeholder="Leave empty for VAT-exempt" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Leave empty for VAT-exempt items. E.g., 12 for 12% VAT</p>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer font-medium">
                  <input type="checkbox" checked={!!newProduct.requiresWeighing}
                    onChange={e => setNewProduct((p:any) => ({...p, requiresWeighing: e.target.checked, minWeightPerUnit: "", maxWeightPerUnit: ""}))} />
                  ⚖️ Requires weighing at delivery
                </label>
                {newProduct.requiresWeighing && (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Weight range per unit (g) <span className="text-red-500">*</span></p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min (g)</label>
                        <input type="number" step="1" min="0" placeholder="e.g. 800"
                          value={newProduct.minWeightPerUnit}
                          onChange={e => setNewProduct((p:any) => ({...p, minWeightPerUnit: e.target.value}))}
                          className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!newProduct.minWeightPerUnit ? "border-red-300 dark:border-red-600" : "border-amber-200 dark:border-amber-700"}`} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Max (g)</label>
                        <input type="number" step="1" min="0" placeholder="e.g. 1400"
                          value={newProduct.maxWeightPerUnit}
                          onChange={e => setNewProduct((p:any) => ({...p, maxWeightPerUnit: e.target.value}))}
                          className={`w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!newProduct.maxWeightPerUnit ? "border-red-300 dark:border-red-600" : "border-amber-200 dark:border-amber-700"}`} />
                      </div>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Weight range used when building orders.</p>
                  </div>
                )}
              </div>
              {/* Track expiry — always visible for any unit type */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-lg p-3 space-y-2">
                <label className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 cursor-pointer font-medium">
                  <input type="checkbox" checked={!!newProduct.trackExpiry}
                    onChange={e => setNewProduct((p:any) => ({...p, trackExpiry: e.target.checked}))} />
                  📅 Track expiry / FIFO
                </label>
                {newProduct.trackExpiry && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                      Initial Expiry Date <span className="text-gray-400 dark:text-gray-500">(optional — set when adding stock)</span>
                    </label>
                    <input type="date" value={newProduct.initialExpiry || ""}
                      onChange={e => setNewProduct((p:any) => ({...p, initialExpiry: e.target.value}))}
                      className="w-full border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">You can also set expiry when receiving stock via +Stock.</p>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20">
                <input type="checkbox" checked={!!newProduct.b2cOnly}
                  onChange={e => setNewProduct((p:any) => ({...p, b2cOnly: e.target.checked}))} />
                <span className="font-medium text-purple-700 dark:text-purple-300">🛍️ B2C Only — hide from wholesale orders</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none p-2 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                <input type="checkbox" checked={!!newProduct.b2bOnly}
                  onChange={e => setNewProduct((p:any) => ({...p, b2bOnly: e.target.checked}))} />
                <span className="font-medium text-blue-700 dark:text-blue-300">🏢 B2B Only — hide from retail orders</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAddProduct(false); setNewProductImageFiles([]); setNewProductImagePreviews([]); }}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Cancel</button>
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Add Stock</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{stockInProduct.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Quantity to Add</label>
                <input type="number" min="0" step="0.001" value={stockInQty}
                  onChange={e => setStockInQty(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  autoFocus />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">Notes (optional)</label>
                <input type="text" value={stockInNotes}
                  onChange={e => setStockInNotes(e.target.value)}
                  placeholder="e.g. Purchase from supplier"
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              {stockInProduct?.trackExpiry && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 block">
                    📅 Expiry Date <span className="text-red-400">*</span>
                  </label>
                  <input type="date" value={stockInExpiry}
                    onChange={e => setStockInExpiry(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
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
              <div className="text-xs text-gray-400 dark:text-gray-500">Current stock: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatQty(stockInProduct.currentStock)}</span> → After: <span className="font-semibold text-green-600">{formatQty(Number(stockInProduct.currentStock) + Number(stockInQty || 0))}</span></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStockInProduct(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">Cancel</button>
                <button onClick={handleStockIn} disabled={stockInSaving || !stockInQty || Number(stockInQty) <= 0 || (stockInProduct?.trackExpiry && !stockInExpiry)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {stockInSaving ? "Saving..." : "Add Stock"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Product Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm mx-auto">
            <div className="flex flex-col items-center text-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <span className="text-2xl">🗑</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Move to Trash?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <span className="font-medium text-gray-900 dark:text-white capitalize">{deleteTarget.name}</span> will be moved to Trash. You can restore it within 30 days.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                autoFocus
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >Keep Product</button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >{deleting ? "Moving..." : "Move to Trash"}</button>
            </div>
          </div>
        </div>
      )}
  </div>
  );
}
