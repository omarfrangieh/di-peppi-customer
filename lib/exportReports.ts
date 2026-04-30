import * as XLSX from "xlsx";

function money(v: number) { return "$" + Number(v || 0).toFixed(2); }
function pct(v: number) { return Number(v || 0).toFixed(1) + "%"; }

export type ReportData = {
  salesByPeriod: [string, { revenue: number; profit: number; orders: number }][];
  byCustomer: { name: string; revenue: number; profit: number; orders: number }[];
  byProduct: { name: string; qty: number; revenue: number; profit: number; customers: Set<string> }[];
  stockData: any[];
  unpaidInvoices: any[];
  totalRevenue: number;
  totalProfit: number;
  period: string;
  fromDate: string;
  toDate: string;
  customerTypeFilter: string;
};

// Apply column widths and freeze to a worksheet
function applySheetMeta(ws: XLSX.WorkSheet, colWidths: number[], freezeRows = 3) {
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
  ws["!freeze"] = { xSplit: 0, ySplit: freezeRows };
}

export function exportToExcel(data: ReportData, selectedTabs: string[]) {
  const wb = XLSX.utils.book_new();
  const label = `${data.customerTypeFilter !== "All" ? data.customerTypeFilter + " " : ""}${data.fromDate} to ${data.toDate}`;

  if (selectedTabs.includes("Sales")) {
    const rows = [
      ["Di Peppi — Sales Report", label],
      [],
      ["Period", "Orders", "Revenue ($)", "Profit ($)", "Margin (%)"],
      ...data.salesByPeriod.map(([key, d]) => [
        key, d.orders, d.revenue, d.profit,
        d.revenue > 0 ? +(d.profit / d.revenue * 100).toFixed(1) : 0
      ]),
      [],
      ["TOTAL", data.salesByPeriod.reduce((s,[,d])=>s+d.orders,0), data.totalRevenue, data.totalProfit,
        data.totalRevenue > 0 ? +(data.totalProfit / data.totalRevenue * 100).toFixed(1) : 0]
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applySheetMeta(ws, [16, 10, 16, 16, 12]);
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
  }

  if (selectedTabs.includes("Customers")) {
    const rows = [
      ["Di Peppi — Customers Report", label],
      [],
      ["Customer", "Orders", "Revenue ($)", "Avg Order ($)", "Profit ($)", "Margin (%)", "% of Sales"],
      ...data.byCustomer.map(c => [
        c.name, c.orders, c.revenue,
        c.orders ? +(c.revenue / c.orders).toFixed(2) : 0,
        c.profit,
        c.revenue > 0 ? +(c.profit / c.revenue * 100).toFixed(1) : 0,
        data.totalRevenue > 0 ? +(c.revenue / data.totalRevenue * 100).toFixed(1) : 0
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applySheetMeta(ws, [28, 10, 14, 14, 14, 12, 12]);
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
  }

  if (selectedTabs.includes("Products")) {
    const rows = [
      ["Di Peppi — Products Report", label],
      [],
      ["Product", "Qty Sold", "Revenue ($)", "Profit ($)", "Margin (%)", "Top Customers"],
      ...data.byProduct.map(p => [
        p.name, p.qty, p.revenue, p.profit,
        p.revenue > 0 ? +(p.profit / p.revenue * 100).toFixed(1) : 0,
        Array.from(p.customers).slice(0, 3).join(", ")
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applySheetMeta(ws, [28, 12, 14, 14, 12, 36]);
    XLSX.utils.book_append_sheet(wb, ws, "Products");
  }

  if (selectedTabs.includes("Stock")) {
    const rows = [
      ["Di Peppi — Stock Report", label],
      [],
      ["Product", "Current Stock", "Min Stock", "Total In", "Total Out", "Status"],
      ...data.stockData.map(p => [
        p.name, p.currentStock, p.minStock || 0, p.inTotal, p.outTotal,
        p.outOfStock ? "Out of Stock" : p.lowStock ? "Low Stock" : "OK"
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applySheetMeta(ws, [28, 14, 12, 12, 12, 14]);
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
  }

  if (selectedTabs.includes("Collections")) {
    const rows = [
      ["Di Peppi — Collections Report", label],
      [],
      ["Invoice", "Customer", "Date", "Total ($)", "Paid ($)", "Balance ($)", "Status"],
      ...data.unpaidInvoices.map(inv => [
        inv.invoiceNumber, inv.customerName, inv.invoiceDate,
        inv.finalTotal, inv.paidAmount || 0,
        Math.max(Number(inv.finalTotal || 0) - Number(inv.paidAmount || 0), 0),
        inv.status
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    applySheetMeta(ws, [14, 24, 12, 14, 14, 14, 14]);
    XLSX.utils.book_append_sheet(wb, ws, "Collections");
  }

  const filename = `DiPeppi_Report_${data.customerTypeFilter}_${data.fromDate}_${data.toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

const fmt = (n: number) => "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtPct = (n: number) => Number(n || 0).toFixed(1) + "%";

// Di Peppi brand red (matches Reports page title #B5535A)
const BRAND_RED: [number, number, number] = [181, 83, 90];

async function loadLogoDataURL(): Promise<string | null> {
  try {
    const res = await fetch("/Di-Peppi-White-Background.jpg");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportToPDF(data: ReportData, selectedTabs: string[]) {
  const { jsPDF } = await import("jspdf");
  const logoDataURL = await loadLogoDataURL();
  {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const typeLabel = data.customerTypeFilter !== "All" ? data.customerTypeFilter : "All";
    const navy: [number, number, number] = [30, 58, 95];
    const burgundy: [number, number, number] = BRAND_RED;
    const lightBg: [number, number, number] = [240, 244, 248];
    const altRow: [number, number, number] = [248, 250, 252];
    const PAGE_W = 297;
    const MARGIN = 10;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    const FOOTER_Y = 200;

    const addFooter = () => {
      const today = new Date().toLocaleDateString("en-GB");
      doc.setDrawColor(226, 232, 240);
      doc.line(MARGIN, FOOTER_Y, PAGE_W - MARGIN, FOOTER_Y);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated ${today} by Di Peppi Admin`, MARGIN, FOOTER_Y + 5);
      doc.text("Confidential", PAGE_W / 2, FOOTER_Y + 5, { align: "center" });
      doc.text(`${data.fromDate} to ${data.toDate}`, PAGE_W - MARGIN, FOOTER_Y + 5, { align: "right" });
    };

    const drawBanner = () => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, PAGE_W, 16, "F");
      doc.setTextColor(255, 255, 255);
      let textX = MARGIN;
      if (logoDataURL) {
        try {
          // Logo: 12mm wide x 10mm tall, vertically centred in 16mm banner
          doc.addImage(logoDataURL, "JPEG", MARGIN, 3, 12, 10);
          textX = MARGIN + 14;
        } catch {
          // fall back to text-only header
        }
      }
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Di Peppi", textX, 10);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("Seafood Wholesale", textX, 14);
      doc.setFontSize(9);
      doc.text(`${data.fromDate} to ${data.toDate}  ·  ${typeLabel}`, PAGE_W - MARGIN, 10, { align: "right" });
    };

    const addHeader = (title: string) => {
      drawBanner();

      // Title bar
      doc.setFillColor(...lightBg);
      doc.rect(0, 16, PAGE_W, 10, "F");
      doc.setDrawColor(...burgundy);
      doc.setLineWidth(1);
      doc.line(0, 16, 0, 26);
      doc.setLineWidth(0.2);
      doc.setTextColor(...burgundy);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title, MARGIN + 2, 23);

      doc.setTextColor(0, 0, 0);
      addFooter();
      return 32; // starting y
    };

    const addTable = (headers: string[], rows: any[][], colWidths: number[], startY: number, title?: string) => {
      const drawTableHeader = (yTop: number) => {
        doc.setFillColor(...navy);
        doc.rect(MARGIN, yTop, CONTENT_W, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        let xH = MARGIN + 2;
        headers.forEach((h, i) => {
          const maxW = colWidths[i] - 3;
          let txt = h.toUpperCase();
          while (txt.length > 1 && doc.getTextWidth(txt) > maxW) txt = txt.slice(0, -1);
          doc.text(txt, xH, yTop + 5);
          xH += colWidths[i];
        });
        return yTop + 7;
      };

      let y = drawTableHeader(startY);
      let x: number;

      // Data rows
      rows.forEach((row, ri) => {
        if (y > FOOTER_Y - 8) {
          doc.addPage();
          drawBanner();
          // "(continued)" marker so it's clear this is mid-table
          if (title) {
            doc.setFillColor(...lightBg);
            doc.rect(0, 16, PAGE_W, 10, "F");
            doc.setDrawColor(...burgundy);
            doc.setLineWidth(1);
            doc.line(0, 16, 0, 26);
            doc.setLineWidth(0.2);
            doc.setTextColor(...burgundy);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`${title} (continued)`, MARGIN + 2, 23);
            doc.setTextColor(0, 0, 0);
          }
          addFooter();
          // Repeat the column header on every continuation page
          y = drawTableHeader(title ? 32 : 20);
        }
        const bg = ri % 2 === 0 ? altRow : ([255, 255, 255] as [number, number, number]);
        doc.setFillColor(...bg);
        doc.rect(MARGIN, y, CONTENT_W, 6.5, "F");
        doc.setDrawColor(226, 232, 240);
        doc.line(MARGIN, y + 6.5, MARGIN + CONTENT_W, y + 6.5);
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        x = MARGIN + 2;
        row.forEach((cell, i) => {
          const maxW = colWidths[i] - 3;
          let txt = String(cell ?? "—");
          while (txt.length > 1 && doc.getTextWidth(txt) > maxW) txt = txt.slice(0, -1);
          if (txt !== String(cell ?? "—")) txt = txt.slice(0, -1) + "…";
          doc.text(txt, x, y + 4.5);
          x += colWidths[i];
        });
        y += 6.5;
      });

      // TOTAL row border
      doc.setDrawColor(...navy);
      doc.setLineWidth(0.5);
      doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
      doc.setLineWidth(0.2);

      return y + 5;
    };

    type Section = {
      tab: string;
      title: string;
      hasData: boolean;
      render: () => void;
    };

    const sections: Section[] = [
      {
        tab: "Sales",
        title: "Sales Report",
        hasData: data.salesByPeriod.length > 0,
        render: () => {
          const startY = addHeader("Sales Report");
          const tableRows = data.salesByPeriod.map(([k, d]) => [
            k, d.orders, fmt(d.revenue), fmt(d.profit),
            d.revenue > 0 ? fmtPct(d.profit / d.revenue * 100) : "—"
          ]);
          const totalOrders = data.salesByPeriod.reduce((s, [, d]) => s + d.orders, 0);
          tableRows.push(["TOTAL", totalOrders, fmt(data.totalRevenue), fmt(data.totalProfit),
            data.totalRevenue > 0 ? fmtPct(data.totalProfit / data.totalRevenue * 100) : "—"]);
          addTable(["Period", "Orders", "Revenue", "Profit", "Margin"], tableRows, [60, 30, 52, 52, 42], startY, "Sales Report");
        },
      },
      {
        tab: "Customers",
        title: "Customers Report",
        hasData: data.byCustomer.length > 0,
        render: () => {
          const startY = addHeader("Customers Report");
          addTable(
            ["Customer", "Orders", "Revenue", "Avg Order", "Profit", "Margin", "% Sales"],
            data.byCustomer.map(c => [
              c.name, c.orders, fmt(c.revenue),
              fmt(c.orders ? c.revenue / c.orders : 0),
              fmt(c.profit),
              c.revenue > 0 ? fmtPct(c.profit / c.revenue * 100) : "—",
              data.totalRevenue > 0 ? fmtPct(c.revenue / data.totalRevenue * 100) : "—"
            ]),
            [60, 22, 35, 35, 35, 28, 28], startY, "Customers Report"
          );
        },
      },
      {
        tab: "Products",
        title: "Products Report",
        hasData: data.byProduct.length > 0,
        render: () => {
          const startY = addHeader("Products Report");
          addTable(
            ["Product", "Qty", "Revenue", "Profit", "Margin", "Top Customers"],
            data.byProduct.map(p => [
              p.name, Number(p.qty).toFixed(2), fmt(p.revenue), fmt(p.profit),
              p.revenue > 0 ? fmtPct(p.profit / p.revenue * 100) : "—",
              Array.from(p.customers as Set<string>).slice(0, 2).join(", ")
            ]),
            [68, 22, 35, 35, 28, 80], startY, "Products Report"
          );
        },
      },
      {
        tab: "Stock",
        title: "Stock Report",
        hasData: data.stockData.length > 0,
        render: () => {
          const startY = addHeader("Stock Report");
          addTable(
            ["Product", "Current Stock", "Min Stock", "Total In", "Total Out", "Status"],
            data.stockData.map(p => [
              p.name, Number(p.currentStock).toFixed(2), p.minStock || "—",
              Number(p.inTotal).toFixed(2), Number(p.outTotal).toFixed(2),
              p.outOfStock ? "Out of Stock" : p.lowStock ? "Low Stock" : "OK"
            ]),
            [80, 32, 28, 32, 32, 38], startY, "Stock Report"
          );
        },
      },
      {
        tab: "Collections",
        title: "Collections Report",
        hasData: data.unpaidInvoices.length > 0,
        render: () => {
          const startY = addHeader("Collections Report");
          addTable(
            ["Invoice", "Customer", "Date", "Total", "Paid", "Balance", "Status"],
            data.unpaidInvoices.map(inv => [
              inv.invoiceNumber, inv.customerName, inv.invoiceDate,
              fmt(inv.finalTotal), fmt(inv.paidAmount || 0),
              fmt(Math.max(Number(inv.finalTotal || 0) - Number(inv.paidAmount || 0), 0)),
              inv.status
            ]),
            [32, 55, 28, 30, 30, 30, 30], startY, "Collections Report"
          );
        },
      },
    ];

    const selected = sections.filter(s => selectedTabs.includes(s.tab));
    const active = selected.filter(s => s.hasData);
    const skipped = selected.filter(s => !s.hasData);

    let isFirst = true;
    for (const s of active) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      s.render();
    }

    // Compact end-of-PDF notice for sections that were selected but had no data,
    // instead of rendering a blank page per empty section.
    if (skipped.length > 0) {
      const names = skipped.map(s => s.title).join(", ");
      // If no active sections rendered, we still need a page with header.
      if (isFirst) {
        addHeader("Report Summary");
        isFirst = false;
      }
      const noticeY = 195;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(MARGIN, noticeY - 4, CONTENT_W, 10, 1.5, 1.5, "FD");
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Sections with no data for this period:", MARGIN + 3, noticeY + 1);
      doc.setFont("helvetica", "normal");
      const labelW = doc.getTextWidth("Sections with no data for this period: ");
      doc.text(names, MARGIN + 3 + labelW + 1, noticeY + 1);
    }

    const filename = `DiPeppi_Report_${data.customerTypeFilter}_${data.fromDate}_${data.toDate}.pdf`;
    doc.save(filename);
    return filename;
  }
}
