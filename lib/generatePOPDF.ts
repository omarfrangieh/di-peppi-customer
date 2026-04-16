import jsPDF from "jspdf";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

function money(val: any) {
  return "$" + (Number(val) || 0).toFixed(2);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return d + "-" + m + "-" + y;
}

async function loadImage(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function generatePOPDF(po: any, mode: "download" | "share" = "download") {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 18;

  const navy = [27, 42, 94];
  const rose = [181, 83, 90];
  const gray = [100, 100, 100];
  const lightGray = [180, 180, 180];
  const dark = [30, 30, 30];
  const white = [255, 255, 255];

  let y = 16;

  // ── LOGO ──────────────────────────────────────────────
  try {
    const logoBase64 = await loadImage("/Di-Peppi-White-Background.jpg");
    if (logoBase64) pdf.addImage(logoBase64 as string, "JPEG", margin, y, 30, 30);
  } catch {}

  // ── PO TITLE (right) ──────────────────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(...(navy as [number, number, number]));
  pdf.text("PURCHASE ORDER", W - margin, y + 10, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...(gray as [number, number, number]));
  pdf.text("PO #: " + (po.poNumber || "-"), W - margin, y + 17, { align: "right" });
  pdf.text("PO Date: " + formatDate(po.poDate), W - margin, y + 23, { align: "right" });
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...(rose as [number, number, number]));
  pdf.text("Delivery Date: " + formatDate(po.deliveryDate), W - margin, y + 29, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...(gray as [number, number, number]));

  y += 36;

  // ── FROM (Di Peppi) ───────────────────────────────────
  pdf.setFontSize(9);
  pdf.setTextColor(...(gray as [number, number, number]));
  pdf.text("Di Peppi — Your Gourmet Companion", margin, y); y += 5;
  pdf.text("+961 71 521714", margin, y); y += 5;
  pdf.text("Instagram: @dipeppi", margin, y); y += 8;

  // ── DIVIDER ───────────────────────────────────────────
  pdf.setDrawColor(...(lightGray as [number, number, number]));
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, W - margin, y);
  y += 8;

  // ── SUPPLIER INFO + CONTACT ───────────────────────────
  const leftX = margin;
  const rightX = W / 2 + 10;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...(lightGray as [number, number, number]));
  pdf.text("SUPPLIER", leftX, y);
  pdf.text("CONTACT", rightX, y);
  y += 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...(rose as [number, number, number]));
  pdf.text(po.supplierName || "-", leftX, y);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...(dark as [number, number, number]));
  pdf.text(po.poContactName || "-", rightX, y);
  y += 5;

  if (po.poContactPhone) {
    pdf.text("Tel: " + po.poContactPhone, rightX, y); y += 5;
  }
  if (po.poContactEmail) {
    pdf.text("Email: " + po.poContactEmail, rightX, y); y += 5;
  }

  y += 6;

  // ── DIVIDER ───────────────────────────────────────────
  pdf.setDrawColor(...(lightGray as [number, number, number]));
  pdf.line(margin, y, W - margin, y);
  y += 6;

  // ── TABLE HEADER ──────────────────────────────────────
  const colItem = margin;
  const colQty = 120;
  const colUnit = 148;
  const colTotal = 174;
  const rowH = 8;

  pdf.setFillColor(...(navy as [number, number, number]));
  pdf.rect(margin, y, colTotal - margin + 10, rowH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...(white as [number, number, number]));
  pdf.text("Product", colItem + 3, y + 5.5);
  pdf.text("Qty", colQty, y + 5.5, { align: "center" });
  pdf.text("Unit Cost", colUnit, y + 5.5, { align: "center" });
  pdf.text("Total", colTotal, y + 5.5, { align: "right" });
  y += rowH;

  // ── TABLE ROWS ────────────────────────────────────────
  (po.items || []).forEach((item: any, i: number) => {
    if (i % 2 === 0) {
      pdf.setFillColor(247, 248, 250);
      pdf.rect(margin, y, colTotal - margin + 10, rowH, "F");
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...(dark as [number, number, number]));
    const isFree = item.sample || item.gift;
    const itemLabel = (item.productName || "-").substring(0, 45) + (isFree ? (item.sample ? "  [SAMPLE]" : "  [GIFT]") : "");
    pdf.text(itemLabel, colItem + 3, y + 5.5);
    pdf.setTextColor(...(gray as [number, number, number]));
    pdf.text(String(item.quantity || 0), colQty, y + 5.5, { align: "center" });
    pdf.text(isFree ? "-" : money(item.unitCostPrice), colUnit, y + 5.5, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(isFree ? 34 : dark[0], isFree ? 197 : dark[1], isFree ? 94 : dark[2]);
    pdf.text(isFree ? "$0.00" : money(item.lineTotal), colTotal, y + 5.5, { align: "right" });
    pdf.setTextColor(...(dark as [number, number, number]));
    y += rowH;
  });

  pdf.setDrawColor(...(lightGray as [number, number, number]));
  pdf.line(margin, y, W - margin, y);
  y += 8;

  // ── TOTAL ─────────────────────────────────────────────
  const valueX = W - margin;
  pdf.setDrawColor(...(lightGray as [number, number, number]));
  pdf.line(130, y, W - margin, y);
  y += 4;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...(navy as [number, number, number]));
  pdf.text("PO Total:", 130, y);
  pdf.text(money(po.poTotal), valueX, y, { align: "right" });
  y += 12;

  // ── FOOTER ────────────────────────────────────────────
  pdf.setDrawColor(...(lightGray as [number, number, number]));
  pdf.line(margin, 275, W - margin, 275);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(10);
  pdf.setTextColor(...(rose as [number, number, number]));
  pdf.text("Di Peppi — Thank you!", W / 2, 281, { align: "center" });

  if (mode === "download") {
    pdf.save((po.poNumber || "purchase-order") + ".pdf");
    return null;
  }

  // ── UPLOAD TO FIREBASE STORAGE & RETURN URL ───────────
  const pdfBlob = pdf.output("blob");
  const fileName = `purchase-orders/${po.poNumber || "po"}-${Date.now()}.pdf`;
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, pdfBlob, { contentType: "application/pdf" });
  const url = await getDownloadURL(storageRef);
  return url;
}
