export function buildWhatsAppReportShare(data: {
  dateFrom: string;
  dateTo: string;
  type: string;
  revenue: number;
  profit: number;
  margin: number;
  orderCount: number;
}): string {
  const fmt = (n: number): string =>
    "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const ARROW  = "\u2192";
  const BOLD   = "*";
  const ITALIC = "_";

  const lines = [
    `${BOLD}Di Peppi Report${BOLD}`,
    `${data.dateFrom} ${ARROW} ${data.dateTo} ${BOLD}(${data.type})${BOLD}`,
    "",
    `Revenue: ${BOLD}${fmt(data.revenue)}${BOLD}`,
    `Profit: ${BOLD}${fmt(data.profit)}${BOLD}`,
    `Margin: ${BOLD}${data.margin.toFixed(1)}%${BOLD}`,
    `Orders: ${BOLD}${data.orderCount}${BOLD}`,
    "",
    `${ITALIC}PDF attached separately${ITALIC}`,
  ];

  const message = lines.join("\n");
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
