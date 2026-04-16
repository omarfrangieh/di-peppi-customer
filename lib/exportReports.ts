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

export function exportToExcel(data: ReportData, selectedTabs: string[]) {
  const wb = XLSX.utils.book_new();
  const label = `${data.customerTypeFilter !== "All" ? data.customerTypeFilter + " " : ""}${data.fromDate} to ${data.toDate}`;

  if (selectedTabs.includes("Sales")) {
    const rows = [
      ["Di Peppi — Sales Report", label],
      [],
      ["Period", "Orders", "Revenue", "Profit", "Margin"],
      ...data.salesByPeriod.map(([key, d]) => [
        key, d.orders, d.revenue, d.profit,
        d.revenue > 0 ? +(d.profit / d.revenue * 100).toFixed(1) : 0
      ]),
      [],
      ["TOTAL", data.salesByPeriod.reduce((s,[,d])=>s+d.orders,0), data.totalRevenue, data.totalProfit,
        data.totalRevenue > 0 ? +(data.totalProfit / data.totalRevenue * 100).toFixed(1) : 0]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sales");
  }

  if (selectedTabs.includes("Customers")) {
    const rows = [
      ["Di Peppi — Customers Report", label],
      [],
      ["Customer", "Orders", "Revenue", "Avg Order", "Profit", "Margin", "% of Sales"],
      ...data.byCustomer.map(c => [
        c.name, c.orders, c.revenue,
        c.orders ? +(c.revenue / c.orders).toFixed(2) : 0,
        c.profit,
        c.revenue > 0 ? +(c.profit / c.revenue * 100).toFixed(1) : 0,
        data.totalRevenue > 0 ? +(c.revenue / data.totalRevenue * 100).toFixed(1) : 0
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Customers");
  }

  if (selectedTabs.includes("Products")) {
    const rows = [
      ["Di Peppi — Products Report", label],
      [],
      ["Product", "Qty Sold", "Revenue", "Profit", "Margin", "Top Customers"],
      ...data.byProduct.map(p => [
        p.name, p.qty, p.revenue, p.profit,
        p.revenue > 0 ? +(p.profit / p.revenue * 100).toFixed(1) : 0,
        Array.from(p.customers).slice(0, 3).join(", ")
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Products");
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Stock");
  }

  if (selectedTabs.includes("Collections")) {
    const rows = [
      ["Di Peppi — Collections Report", label],
      [],
      ["Invoice", "Customer", "Date", "Total", "Paid", "Balance", "Status"],
      ...data.unpaidInvoices.map(inv => [
        inv.invoiceNumber, inv.customerName, inv.invoiceDate,
        inv.finalTotal, inv.paidAmount || 0,
        Math.max(Number(inv.finalTotal || 0) - Number(inv.paidAmount || 0), 0),
        inv.status
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Collections");
  }

  const filename = `DiPeppi_Report_${data.customerTypeFilter}_${data.fromDate}_${data.toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

export function exportToPDF(data: ReportData, selectedTabs: string[]) {
  // Dynamic import to avoid SSR issues
  return import("jspdf").then(({ jsPDF }) => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const label = `${data.customerTypeFilter !== "All" ? data.customerTypeFilter + " · " : ""}${data.fromDate} to ${data.toDate}`;
    const navy = [27, 42, 94] as [number, number, number];
    const burgundy = [181, 83, 90] as [number, number, number];
    let y = 20;

    const addHeader = (title: string) => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, 297, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Di Peppi", 10, 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(label, 297 - 10, 9, { align: "right" });
      doc.setTextColor(...burgundy);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(title, 10, 22);
      doc.setTextColor(0, 0, 0);
      y = 30;
    };

    const addTable = (headers: string[], rows: any[][], colWidths: number[]) => {
      // Header row
      doc.setFillColor(...navy);
      doc.rect(10, y, 277, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      let x = 12;
      headers.forEach((h, i) => { doc.text(h, x, y + 5); x += colWidths[i]; });
      y += 7;

      // Data rows
      rows.forEach((row, ri) => {
        if (y > 185) { doc.addPage(); y = 20; }
        doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
        doc.rect(10, y, 277, 6.5, "F");
        doc.setTextColor(50, 50, 50);
        doc.setFont("helvetica", "normal");
        x = 12;
        row.forEach((cell, i) => {
          doc.text(String(cell ?? "—"), x, y + 4.5);
          x += colWidths[i];
        });
        y += 6.5;
      });
      y += 5;
    };

    let isFirst = true;

    if (selectedTabs.includes("Sales")) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      addHeader("Sales Report");
      addTable(
        ["Period", "Orders", "Revenue", "Profit", "Margin"],
        data.salesByPeriod.map(([k, d]) => [k, d.orders, money(d.revenue), money(d.profit), d.revenue > 0 ? pct(d.profit/d.revenue*100) : "—"]),
        [60, 30, 50, 50, 40]
      );
    }

    if (selectedTabs.includes("Customers")) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      addHeader("Customers Report");
      addTable(
        ["Customer", "Orders", "Revenue", "Avg Order", "Profit", "Margin", "% Sales"],
        data.byCustomer.map(c => [c.name, c.orders, money(c.revenue), money(c.orders ? c.revenue/c.orders : 0), money(c.profit), c.revenue > 0 ? pct(c.profit/c.revenue*100) : "—", data.totalRevenue > 0 ? pct(c.revenue/data.totalRevenue*100) : "—"]),
        [60, 25, 35, 35, 35, 30, 30]
      );
    }

    if (selectedTabs.includes("Products")) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      addHeader("Products Report");
      addTable(
        ["Product", "Qty", "Revenue", "Profit", "Margin", "Top Customers"],
        data.byProduct.map(p => [p.name, Number(p.qty).toFixed(2), money(p.revenue), money(p.profit), p.revenue > 0 ? pct(p.profit/p.revenue*100) : "—", Array.from(p.customers).slice(0,2).join(", ")]),
        [70, 25, 35, 35, 30, 80]
      );
    }

    if (selectedTabs.includes("Stock")) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      addHeader("Stock Report");
      addTable(
        ["Product", "Current Stock", "Min Stock", "Total In", "Total Out", "Status"],
        data.stockData.map(p => [p.name, p.currentStock, p.minStock || "—", Number(p.inTotal).toFixed(2), Number(p.outTotal).toFixed(2), p.outOfStock ? "Out of Stock" : p.lowStock ? "Low Stock" : "OK"]),
        [80, 35, 30, 35, 35, 40]
      );
    }

    if (selectedTabs.includes("Collections")) {
      if (!isFirst) doc.addPage();
      isFirst = false;
      addHeader("Collections Report");
      addTable(
        ["Invoice", "Customer", "Date", "Total", "Paid", "Balance", "Status"],
        data.unpaidInvoices.map(inv => [inv.invoiceNumber, inv.customerName, inv.invoiceDate, money(inv.finalTotal), money(inv.paidAmount||0), money(Math.max(Number(inv.finalTotal||0)-Number(inv.paidAmount||0),0)), inv.status]),
        [35, 55, 30, 30, 30, 30, 30]
      );
    }

    const filename = `DiPeppi_Report_${data.customerTypeFilter}_${data.fromDate}_${data.toDate}.pdf`;
    doc.save(filename);
    return filename;
  });
}
