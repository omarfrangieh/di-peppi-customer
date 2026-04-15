export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partly_paid"
  | "paid"
  | "cancelled";

export type Invoice = {
  id: string;
  invoiceNumber?: string;

  orderId: string;
  customerId?: string;

  status: InvoiceStatus;

  invoiceDate: string;
  dueDate?: string;

  customerName: string;
  customerType?: string;

  subtotalGross: number;
  itemDiscountTotal: number;
  orderDiscountPercent: number;
  orderDiscountAmount: number;
  subtotalNet: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  finalTotal: number;

  currency?: string;

  notes?: string;
  sourceOrderName?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
  createdFromOrderAt?: unknown;
};

export type InvoiceItem = {
  id: string;
  invoiceId: string;
  orderId: string;
  orderItemId?: string;

  productId?: string;
  productName: string;
  quantity: number;

  unitPrice: number;
  unitCostPrice: number;
  itemDiscountPercent: number;
  itemDiscountAmount: number;
  lineGross: number;
  lineNet: number;

  notes?: string;
  sample?: boolean;
  gift?: boolean;

  createdAt?: unknown;
  updatedAt?: unknown;
};
