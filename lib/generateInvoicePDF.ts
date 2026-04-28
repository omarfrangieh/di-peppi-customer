import jsPDF from "jspdf";

function money(val: number) {
  return "$" + (Number(val) || 0).toFixed(2);
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return d + "-" + m + "-" + y;
}

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateInvoicePDF(invoice: any, lines: any[]) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const margin = 18;

  // Brand colors
  const navy: [number, number, number] = [27, 42, 94];
  const rose: [number, number, number] = [181, 83, 90];
  const gray: [number, number, number] = [100, 100, 100];
  const lightGray: [number, number, number] = [180, 180, 180];
  const dark: [number, number, number] = [30, 30, 30];
  const white: [number, number, number] = [255, 255, 255];

  let y = 16;

  // ── LOGO ──────────────────────────────────────────────
  try {
    const logoBase64 = await loadImage("/Di-Peppi-White-Background.jpg");
    if (logoBase64) pdf.addImage(logoBase64, "JPEG", margin, y, 30, 30);
  } catch {}

  // ── INVOICE TITLE (right) ─────────────────────────────
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.setTextColor(...rose);
  pdf.text("INVOICE", W - margin, y + 10, { align: "right" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...gray);
  pdf.text("Invoice #: " + (invoice.invoiceNumber || "Draft"), W - margin, y + 17, { align: "right" });
  pdf.text("Date: " + formatDate(invoice.invoiceDate), W - margin, y + 23, { align: "right" });
  if (invoice.dueDate) {
    pdf.text("Due: " + formatDate(invoice.dueDate), W - margin, y + 29, { align: "right" });
  }

  y += 36;

  // ── COMPANY INFO (left) ───────────────────────────────
  pdf.setFontSize(9);
  pdf.setTextColor(...gray);
  pdf.text("Your Gourmet Companion", margin, y);
  y += 5;
  pdf.text("+961 71 521714", margin, y);
  y += 5;
  pdf.text("Instagram: @dipeppi", margin, y);
  pdf.link(margin, y - 4, 40, 5, { url: "https://instagram.com/dipeppi" });
  y += 8;

  // ── DIVIDER ───────────────────────────────────────────
  pdf.setDrawColor(...lightGray);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, W - margin, y);
  y += 8;

  // ── BILL TO + ORDER INFO ──────────────────────────────
  const billToX = margin;
  const orderX = W / 2 + 10;

  // Bill To label
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...lightGray);
  pdf.text("BILL TO", billToX, y);
  pdf.text("ORDER DETAILS", orderX, y);
  y += 5;

  // Customer name
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...rose);
  pdf.text(invoice.customerName || "-", billToX, y);

  // Order info
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...dark);
  pdf.text("Order #: " + (invoice.sourceOrderName || invoice.orderId || "-"), orderX, y);
  y += 5;
  pdf.text("Date: " + formatDate(invoice.invoiceDate), orderX, y);

  // Customer details
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...dark);

  if (invoice.customerPhone) {
    const phone = String(invoice.customerPhone).startsWith("+") ? invoice.customerPhone : "+" + invoice.customerPhone;
    const phoneDigits = phone.replace(/[^0-9]/g, "");
    pdf.text(phone, billToX, y);
    pdf.link(billToX, y - 4, 40, 5, { url: "https://wa.me/" + phoneDigits });
    y += 5;
  }

  const addrLines = [
    invoice.customerBuilding ? "Bldg: " + invoice.customerBuilding : "",
    invoice.customerApartment ? "Apartment: " + invoice.customerApartment : "",
    invoice.customerFloor ? "Floor: " + invoice.customerFloor : "",
    invoice.customerCity ? "City: " + invoice.customerCity : "",
    invoice.customerCountry && invoice.customerCountry !== invoice.customerCity ? invoice.customerCountry : "",
    invoice.customerAdditionalInstructions ? "Notes: " + invoice.customerAdditionalInstructions : "",
  ].filter(Boolean);

  addrLines.forEach((line: string) => { pdf.text(line, billToX, y); y += 5; });

  // Google Maps link
  if (invoice.customerMapsLink) {
    pdf.setTextColor(...rose);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("View on Google Maps", billToX, y);
    pdf.link(billToX, y - 4, 50, 5, { url: invoice.customerMapsLink });
    y += 5;
  }

  y += 6;

  // ── DIVIDER ───────────────────────────────────────────
  pdf.setDrawColor(...lightGray);
  pdf.line(margin, y, W - margin, y);
  y += 6;

  // ── TABLE HEADER ──────────────────────────────────────
  const colItem = margin;
  const colQty = 108;
  const colPrice = 130;
  const colDisc = 150;
  const colAmt = 174;
  const rowH = 8;

  pdf.setFillColor(...navy);
  pdf.rect(margin, y, colAmt - margin + 10, rowH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...white);
  pdf.text("Item & Description", colItem + 3, y + 5.5);
  pdf.text("Qty", colQty, y + 5.5, { align: "center" });
  pdf.text("Price", colPrice, y + 5.5, { align: "center" });
  pdf.text("Discount", colDisc, y + 5.5, { align: "center" });
  pdf.text("Amount", colAmt, y + 5.5, { align: "right" });
  y += rowH;

  // ── TABLE ROWS ────────────────────────────────────────
  lines.forEach((line: any, i: number) => {
    if (i % 2 === 0) {
      pdf.setFillColor(247, 248, 250);
      pdf.rect(margin, y, colAmt - margin + 10, rowH, "F");
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...dark);
    const productLabel = line.preparation 
      ? (line.productName || "-").substring(0, 35) + " [" + line.preparation + "]"
      : (line.productName || "-").substring(0, 48);
    pdf.text(productLabel, colItem + 3, y + 5.5);
    pdf.setTextColor(...gray);
    pdf.text(String(line.quantity || 0), colQty, y + 5.5, { align: "center" });
    pdf.text(money(line.unitPrice), colPrice, y + 5.5, { align: "center" });
    pdf.text(line.itemDiscountPercent > 0 ? line.itemDiscountPercent + "%" : "-", colDisc, y + 5.5, { align: "center" });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...dark);
    pdf.text(money(line.lineGross), colAmt, y + 5.5, { align: "right" });
    y += rowH;
  });

  pdf.setDrawColor(...lightGray);
  pdf.line(margin, y, W - margin, y);
  y += 8;

  // ── TOTALS ────────────────────────────────────────────
  const labelX = 130;
  const valueX = W - margin;

  const addTotalRow = (label: string, value: string, color: [number, number, number], bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 10 : 9);
    pdf.setTextColor(...color);
    pdf.text(label, labelX, y);
    pdf.text(value, valueX, y, { align: "right" });
    y += 6;
  };

  addTotalRow("Sub Total:", money(invoice.subtotalGross), gray);
  if (invoice.itemDiscountTotal > 0) addTotalRow("Item Discounts:", money(invoice.itemDiscountTotal), rose);
  if (invoice.orderDiscountAmount > 0) addTotalRow("Order Discount (" + invoice.orderDiscountPercent + "%):", money(invoice.orderDiscountAmount), rose);
  if (invoice.deliveryFee > 0) addTotalRow("Delivery:", money(invoice.deliveryFee), gray);
  if (invoice.taxRate > 0 && invoice.taxAmount > 0) addTotalRow("VAT (" + invoice.taxRate + "%):", money(invoice.taxAmount), gray);
  if (invoice.roundingAdjustment && invoice.roundingAdjustment !== 0) {
    addTotalRow(
      "Rounding:",
      money(Math.abs(invoice.roundingAdjustment)),
      gray
    );
  }

  pdf.setDrawColor(...lightGray);
  pdf.line(labelX, y, W - margin, y);
  y += 4;

  addTotalRow("Total:", money(invoice.finalTotal), navy, true);

  const paidAmount = invoice.paidAmount || (invoice.status === "paid" ? invoice.finalTotal : 0);
  const balanceDue = (invoice.finalTotal || 0) - paidAmount;
  addTotalRow("Paid Amount:", money(paidAmount), gray);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...(balanceDue <= 0 ? [34, 197, 94] as [number, number, number] : rose));
  pdf.text("Balance Due:", labelX, y);
  pdf.text(money(balanceDue), valueX, y, { align: "right" });
  y += 10;

  // ── PAYMENT TERMS ────────────────────────────────────
  if (invoice.notes || invoice.paymentMethod) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...dark);
    pdf.text("Payment Terms", margin, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...gray);
    if (invoice.paymentMethod) { pdf.text(invoice.paymentMethod, margin, y); y += 5; }
    if (invoice.notes) { pdf.text(invoice.notes, margin, y); y += 5; }
  }

  // ── PAID WATERMARK ──────────────────────────────────────
  if (invoice.status === "paid") {
    pdf.setGState(new (pdf as any).GState({ opacity: 0.18 }));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(90);
    pdf.setTextColor(34, 197, 94);
    pdf.text("PAID", W / 2, 160, { align: "center", angle: 45 });
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
  }

  if (invoice.status === "cancelled") {
    pdf.setGState(new (pdf as any).GState({ opacity: 0.18 }));
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(70);
    pdf.setTextColor(239, 68, 68);
    pdf.text("CANCELLED", W / 2, 160, { align: "center", angle: 45 });
    pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
  }

  // ── FOOTER ────────────────────────────────────────────
  pdf.setDrawColor(...lightGray);
  pdf.line(margin, 275, W - margin, 275);
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(10);
  pdf.setTextColor(...rose);
  pdf.text("Bon Appétit!", W / 2, 281, { align: "center" });

  pdf.save((invoice.invoiceNumber || "invoice") + ".pdf");
}
