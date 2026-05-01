# Di Peppi — Mobile App Specification
**Version:** 1.0  
**Date:** April 30, 2026  
**Platform:** React Native (iOS + Android)  
**Backend:** Firebase (Firestore, Auth, Functions, Storage)

---

## 1. Overview

Di Peppi is a specialty food brand with three distinct user-facing portals. This spec covers the full React Native mobile version of all three:

| Portal | Audience | Web Route |
|---|---|---|
| **Admin** | Internal staff / managers | `/admin` |
| **Customer (B2C)** | Retail customers | `/customer` |
| **B2B Trade** | Wholesale business accounts | `/b2b` |

The mobile app can be built as a **single app with role-based navigation**, or as **two separate apps** (Staff App + Customer/B2B App). Recommended: single app with role-based routing on login.

---

## 2. Tech Stack Recommendations

| Layer | Choice | Notes |
|---|---|---|
| Framework | React Native (Expo SDK 51+) | Fastest path, OTA updates via EAS Update |
| Navigation | React Navigation v6 | Stack + Bottom Tabs + Drawer |
| State | Zustand | Lightweight, replaces localStorage cart logic |
| Firebase | `@react-native-firebase` | Full native SDK for performance |
| Auth | Firebase Auth + OTP flow via Cloud Functions | Reuse existing `sendOTP` / `verifyOTP` functions |
| HTTP | Axios + React Query (TanStack) | Caching, background refetch |
| UI Components | React Native Paper or custom | Match Di Peppi brand colors |
| Images | `expo-image` | Lazy loading, caching |
| Charts | `react-native-gifted-charts` | Revenue sparkline on dashboard |
| PDF / Receipts | `react-native-pdf` + `expo-print` | Invoice viewing |
| Push Notifications | Firebase Cloud Messaging (FCM) | Order status updates |

---

## 3. Brand / Design Tokens

```
Primary Navy:   #1B2A5E
Accent Red:     #B5535A
WhatsApp Green: #25D366
Success:        #22C55E
Warning:        #F59E0B
Danger:         #EF4444
Background:     #F9FAFB
Surface:        #FFFFFF
Text Primary:   #111827
Text Muted:     #6B7280
Border:         #E5E7EB
```

**Typography:** System font (SF Pro on iOS, Roboto on Android)  
**Border Radius:** 12px cards, 8px inputs, 24px bottom sheets  
**Shadows:** Soft elevation (elevation 2–4 on Android, shadowOffset on iOS)

---

## 4. Authentication Flow

### 4.1 Entry Screen
Single "Welcome" screen with two paths:
- **Shop (Customer)** → Customer OTP login
- **Business (B2B)** → B2B OTP login
- **Staff Login** → Admin PIN/OTP login (accessible via small link or long-press logo)

### 4.2 OTP Login (Customer & B2B)

**Screen: `LoginScreen`**

| Element | Detail |
|---|---|
| Input | Email OR phone number (toggle between `email` and `phone` keyboard type) |
| OTP Method | Toggle: `Email` / `WhatsApp` (same as web fix applied) |
| Validation | Email: must contain `@`. Phone (WhatsApp): must start with `+` |
| CTA | "Send OTP" → calls `sendOTP` Cloud Function |
| OTP Entry Screen | 6-digit input with auto-advance between boxes |
| OTP Verify | Calls `verifyOTP` → receives `customToken` → `signInWithCustomToken(auth, token)` |
| Session Storage | Stored in `AsyncStorage` (replaces `localStorage`) |

**Cloud Functions used:**
- `sendOTP({ email, method: "email" | "whatsapp" })`
- `verifyOTP({ target, otp, userId })` → returns `{ success, customToken, userId, name, role, ... }`

### 4.3 Admin Login
OTP via email or simple passcode. Role check on login: if `role === "admin"` or `"staff"`, route to Admin stack.

---

## 5. Navigation Architecture

```
AppNavigator
├── AuthStack (unauthenticated)
│   ├── WelcomeScreen
│   ├── CustomerLoginScreen
│   ├── B2BLoginScreen
│   └── AdminLoginScreen
│
├── CustomerStack (role: customer)
│   └── CustomerBottomTabs
│       ├── HomeTab        → CustomerHomeScreen
│       ├── ShopTab        → ProductsScreen → ProductDetailScreen
│       ├── CartTab        → CartScreen → CheckoutScreen
│       ├── OrdersTab      → OrdersScreen → OrderDetailScreen
│       └── ProfileTab     → ProfileScreen, WalletScreen
│
├── B2BStack (role: b2b)
│   └── B2BBottomTabs
│       ├── HomeTab        → B2BHomeScreen
│       ├── CatalogueTab   → B2BProductsScreen
│       ├── CartTab        → B2BCartScreen → B2BCheckoutScreen
│       ├── OrdersTab      → B2BOrdersScreen → B2BOrderDetailScreen
│       └── AccountTab     → B2BProfileScreen
│
└── AdminStack (role: admin / staff)
    └── AdminDrawer
        ├── DashboardScreen
        ├── OrdersScreen → OrderDetailScreen → NewOrderScreen
        ├── ProductsScreen
        ├── CustomersScreen → CustomerImportScreen
        ├── SuppliersScreen
        ├── PurchaseOrdersScreen
        ├── StockScreen
        ├── InvoicesScreen → InvoiceDetailScreen
        ├── ReportsScreen
        ├── UsersScreen
        ├── PermissionsScreen
        └── AuditLogScreen
```

---

## 6. Admin Portal — Screen Specs

### 6.1 Dashboard

**Route:** `AdminDashboardScreen`

**Data fetched:**
- Orders via `GET https://us-central1-di-peppi.cloudfunctions.net/getOrders`
- `products` collection (Firestore)
- `orderItems` collection (Firestore)
- `stockMovements` collection (Firestore)
- `invoices` collection (Firestore)

**Sections (top → bottom):**

| Section | Mobile Adaptation |
|---|---|
| Header: "Dashboard" + Search icon + "+ New Order" button | Sticky top bar. Search opens full-screen modal (replaces ⌘K palette). |
| **Today's Snapshot** (packs to do, deliveries, weighing) | Horizontal scrollable chip row. Only shown if counts > 0. |
| **Date Range Filter** (Today / Week / Month / All) | Segmented control (4 options). |
| **KPI Cards** (Active Orders, Revenue, Outstanding Invoices, Need Weighing) | 2×2 grid, each tappable → navigates to relevant screen. Revenue card has sparkline chart below the value. |
| **Expiry Alerts** | Collapsible card. Horizontal scroll of alert chips (expired = red, critical = orange, 90-day = yellow). |
| **Low Stock** | Collapsible card. Grid of stock pills. Each tappable → opens Stock Receive sheet. "Create POs" button → opens bottom sheet with checklist + qty inputs. |
| **Order Pipeline (Kanban)** | Replace drag-and-drop with **3 swipeable tabs**: "Draft & Preparing" / "To Deliver" / "Delivered". Each tab lists OrderCards. Long-press card → bottom sheet to advance status. |
| **Recent Activity** | Vertical list (last 10 items). Icon + text + time-ago. |
| **Top Customers** + **Top Products** | Two stacked cards with simple ranked lists. |

**Key interactions:**
- Pull-to-refresh reloads all data
- Order card tap → OrderDetailScreen
- "+" FAB button → NewOrderScreen

---

### 6.2 Orders List

**Route:** `AdminOrdersScreen`

**Filters:**
- Search bar (name, customer)
- Status filter chips: All / Draft / Confirmed / Preparing / To Deliver / Delivered / Cancelled
- Type filter: All / B2C / B2B
- Sort toggle: Newest / Oldest

**Order List Item:**
```
┌─────────────────────────────────────────┐
│ [Customer Name]          [B2C]  [$123]  │
│ Order #ORD-2026-001                     │
│ [Status Badge]  [⚖️ Weigh!]            │
│ Delivery: 02-05-2026 ⚠️ (if overdue)   │
└─────────────────────────────────────────┘
```

**Status color system:**
- Draft: Gray
- Confirmed: Blue
- Preparing: Yellow
- To Deliver: Orange
- Delivered: Green
- Cancelled: Red

**Status flow:** Draft → Confirmed → Preparing → To Deliver → Delivered  
Advance status via "Advance →" button on detail screen.

---

### 6.3 Order Detail

**Route:** `AdminOrderDetailScreen`

**Sections:**
1. Header: Order number + status badge + customer type badge
2. Customer info: name, phone, address
3. Delivery date
4. Items list: product name, quantity, unit, line price
5. Subtotal / Discount / Delivery Fee / Final Total
6. Notes field
7. Status actions: "Advance to [Next Status]" primary button, "Cancel Order" destructive button
8. If weighing required: red banner "⚖️ This order has items that require weighing"

---

### 6.4 New Order

**Route:** `NewOrderScreen`

**Fields:**
- Customer name (autocomplete from customers collection)
- Customer type (B2C / B2B)
- Delivery date (date picker, Lebanon holidays blocked)
- Add items (product search → quantity input)
- Notes
- Delivery fee
- Discount

---

### 6.5 Products

**Route:** `AdminProductsScreen`

**List item per product:**
- Product image (thumbnail)
- Name + sub-name
- Category badge + storage type badge
- Current stock + unit (color-coded: red if below min)
- Price
- Active/Inactive toggle

**Actions:**
- Add product (FAB → full-screen form)
- Edit product (tap → edit sheet)
- Stock In: quick bottom sheet → qty + expiry date + notes
- View history: stock movement timeline
- Toggle active/inactive

**Product form fields:**
```
name, productSubName, category (dropdown), origin (dropdown),
unit (Jar/KG/Piece/Tin/Tube), storageType (Ambient/Chilled/Fresh/Frozen/Refrigerated),
price, minStock, supplierId, productImage (photo picker / camera),
requiresWeighing (toggle), active (toggle)
```

---

### 6.6 Customers

**Route:** `AdminCustomersScreen`

**List:** name, email, phone, address, wallet balance  
**Actions:** Add, Edit, Import CSV  
**Detail:** customer info + order history + wallet transactions

---

### 6.7 Suppliers

**Route:** `AdminSuppliersScreen`

**List:** supplier name, contact, email  
**Actions:** Add, Edit, Delete

---

### 6.8 Purchase Orders

**Route:** `AdminPurchaseOrdersScreen`

**List fields:** PO number, supplier, date, status, total  
**Statuses:** Generated / Sent / Received / Cancelled  
**Detail:** items list with qty + unit cost, PO total  
**Create:** auto-generated from low stock dashboard widget

---

### 6.9 Stock

**Route:** `AdminStockScreen`

**Tabs:**
1. **Current Stock** — product list with current stock level + mini progress bar
2. **Movements** — filterable list of all In/Out movements with date, qty, product
3. **Expiry Tracker** — batches sorted by expiry date, color-coded

**Receive Stock Sheet:**
- Product (pre-filled if opened from low stock)
- Quantity + unit
- Expiry date (optional)
- Notes

---

### 6.10 Invoices

**Route:** `AdminInvoicesScreen`

**List:** invoice number, customer, issue date, due date, total, status (Issued / Overdue / Paid)  
**Detail:** full invoice view, PDF export via `expo-print`  
**Status actions:** Mark as Paid

---

### 6.11 Reports

**Route:** `AdminReportsScreen`

**Cards:**
- Revenue by period (chart)
- Orders by status
- Top products by qty
- Top customers by revenue
- Stock value report

---

### 6.12 Users & Permissions

**Route:** `AdminUsersScreen`, `AdminPermissionsScreen`

Manage internal staff accounts and role-based access.

---

### 6.13 Audit Log

**Route:** `AdminAuditLogScreen`

Chronological log of all admin actions (create/update/delete on orders, products, etc.). Filterable by user and date.

---

## 7. Customer (B2C) Portal — Screen Specs

### 7.1 Home

**Route:** `CustomerHomeScreen`

| Element | Detail |
|---|---|
| Header | "Hello, [Name]" greeting + Di Peppi logo |
| Menu grid | 2×2 cards: Browse Products, Cart (with badge), Order History, Wallet |
| Quick cart preview | If cart not empty, show item count + "View Cart" CTA |

---

### 7.2 Products

**Route:** `CustomerProductsScreen`

**Data:** Firestore `products` collection, `where("active", "==", true)`, real-time `onSnapshot`

**Layout:** 2-column grid of product cards

**Product Card:**
```
┌──────────────────┐
│   [Product Img]  │
│  Product Name    │
│  Sub-name        │
│  Origin · Unit   │
│  $12.50/kg       │
│  [Add to Cart]   │
└──────────────────┘
```

**Filter bar:**
- Search input
- Category chips (horizontal scroll)
- Storage type filter (bottom sheet)

**Out of stock:** Card shown with "Out of Stock" overlay, Add button disabled

---

### 7.3 Product Detail

**Route:** `CustomerProductDetailScreen`

**Sections:**
1. Full-width product image
2. Name, sub-name, origin
3. Price + unit
4. Description
5. Storage type badge
6. Stock indicator
7. Quantity selector (−/+)
8. "Add to Cart" button (sticky at bottom)
9. Related products horizontal scroll

---

### 7.4 Cart

**Route:** `CustomerCartScreen`

**Cart item row:**
```
[Image] Product Name        [−] 2 [+]   $25.00
        Sub-name / unit               [Remove]
```

**Cart summary:**
- Subtotal
- Delivery fee (from customer profile)
- Total
- "Proceed to Checkout" CTA

Empty state: illustration + "Start Shopping" button

---

### 7.5 Checkout

**Route:** `CustomerCheckoutScreen`

**Fields:**
- Delivery address (pre-filled from profile, editable)
- Delivery date (date picker — Lebanese public holidays blocked, Sundays blocked)
- Notes
- Payment method (Cash on Delivery / Wallet)

**Order confirmation:** Creates order in Firestore `orders` collection with:
```
name (generated order number), customerName, customerId, items[],
deliveryDate, address, notes, paymentMethod, status: "Draft",
finalTotal, createdAt
```

**Success screen:** Order number + "Track Order" button

---

### 7.6 Orders

**Route:** `CustomerOrdersScreen`

**List:** order number, date, status badge, total  
**Filter:** All / Active / Delivered

**Order Detail (`CustomerOrderDetailScreen`):**
- Items + quantities + prices
- Delivery date
- Status timeline (Draft → Confirmed → Preparing → To Deliver → Delivered)
- Total breakdown

---

### 7.7 Profile

**Route:** `CustomerProfileScreen`

**Fields:** Name, email, phone, delivery address, delivery fee (read-only)  
**Actions:** Edit name/address, Logout

---

### 7.8 Wallet

**Route:** `CustomerWalletScreen`

**Sections:**
1. Balance card (large, prominent)
2. Transaction list:
   - Type: credit (green) / debit (red)
   - Description + reference
   - Amount + date

---

## 8. B2B Trade Portal — Screen Specs

### 8.1 Home

**Route:** `B2BHomeScreen`

**Sections:**
- Welcome hero: "Hello, [Company Name]"
- Menu grid: Product Catalogue, Order Cart (badge), Order History, Account
- Benefits strip: Wholesale Pricing, Invoice Terms, Bulk Ordering, VAT Invoices

---

### 8.2 Product Catalogue

**Route:** `B2BProductsScreen`

**Same structure as Customer products** but:
- Shows wholesale price instead of retail
- Allows bulk quantity input (kg/case)
- No "out of stock" blocking (B2B can back-order)

---

### 8.3 Cart

**Route:** `B2BCartScreen`

Same as Customer cart but:
- Line items show wholesale price
- Qty input is freeform (not just integer)
- "Submit Order" instead of "Checkout"

---

### 8.4 Checkout / Order Submission

**Route:** `B2BCheckoutScreen`

**Fields:**
- Delivery address
- Delivery date
- PO reference number (optional)
- Notes / special instructions
- Payment terms (Net 30 / Net 60 / Immediate)

Creates order with `customerType: "B2B"`.

---

### 8.5 Order History

**Route:** `B2BOrdersScreen`

Same structure as Customer orders. Shows invoice status alongside order status.

**Order Detail (`B2BOrderDetailScreen`):**
- Items + wholesale pricing
- Invoice reference (if issued)
- Payment terms
- Status timeline

---

### 8.6 Account / Profile

**Route:** `B2BProfileScreen`

**Fields:** Company name, contact name, email, phone, billing address, VAT number  
**Actions:** Edit company info, Logout

---

## 9. Shared / Cross-Portal Features

### 9.1 Push Notifications (FCM)

| Trigger | Audience | Message |
|---|---|---|
| Order status changed | Customer / B2B | "Your order #ORD-001 is now [status]" |
| Order delivered | Customer / B2B | "Your order has been delivered! 🎉" |
| Low stock alert | Admin | "3 products are below minimum stock" |
| Invoice overdue | Admin | "Invoice INV-042 is overdue" |
| New order placed | Admin | "New order from [Customer]" |

### 9.2 Offline Support
- Cart persisted in AsyncStorage (survives app close)
- Product list cached via React Query (stale-while-revalidate)
- Orders list cached locally, background refresh on app resume

### 9.3 Deep Linking
```
dipeppi://order/[id]         → OrderDetailScreen
dipeppi://product/[id]       → ProductDetailScreen
dipeppi://admin/orders/[id]  → AdminOrderDetailScreen
```

### 9.4 Dark Mode
Support system dark mode. Admin dashboard already has full dark mode CSS — implement matching `darkColorScheme` token set.

---

## 10. Firebase Integration

### 10.1 Collections Used

| Collection | Used by |
|---|---|
| `orders` | Admin, Customer, B2B |
| `orderItems` | Admin |
| `products` | Admin, Customer, B2B |
| `customers` | Admin, Customer |
| `stockMovements` | Admin |
| `invoices` | Admin |
| `purchaseOrders` | Admin |
| `suppliers` | Admin |
| `settings` (poCounter) | Admin |

### 10.2 Cloud Functions

| Function | Type | Caller |
|---|---|---|
| `getOrders` | HTTP GET | Admin dashboard & orders list |
| `sendOTP` | Callable | All login screens |
| `verifyOTP` | Callable | All login screens |

### 10.3 AsyncStorage Keys (replaces localStorage)
```
"session"           → Customer session object
"b2b-session"       → B2B session object
"admin-session"     → Admin session object
"customer-cart"     → Cart items (JSON array)
"b2b-cart"          → B2B cart items (JSON array)
"customToken"       → Firebase custom auth token
```

---

## 11. Screen Inventory Summary

### Admin (13 screens)
1. AdminLoginScreen
2. AdminDashboardScreen
3. AdminOrdersScreen
4. AdminOrderDetailScreen
5. AdminNewOrderScreen
6. AdminProductsScreen
7. AdminCustomersScreen
8. AdminSuppliersScreen
9. AdminPurchaseOrdersScreen
10. AdminStockScreen
11. AdminInvoicesScreen
12. AdminReportsScreen
13. AdminAuditLogScreen

### Customer B2C (9 screens)
1. CustomerLoginScreen
2. CustomerHomeScreen
3. CustomerProductsScreen
4. CustomerProductDetailScreen
5. CustomerCartScreen
6. CustomerCheckoutScreen
7. CustomerOrdersScreen
8. CustomerOrderDetailScreen
9. CustomerProfileScreen
10. CustomerWalletScreen *(10th)*

### B2B (8 screens)
1. B2BLoginScreen
2. B2BHomeScreen
3. B2BProductsScreen
4. B2BCartScreen
5. B2BCheckoutScreen
6. B2BOrdersScreen
7. B2BOrderDetailScreen
8. B2BProfileScreen

### Shared (2 screens)
1. WelcomeScreen
2. OTPEntryScreen (reusable component)

**Total: ~33 screens**

---

## 12. Development Phases

### Phase 1 — Foundation (Week 1–2)
- Project setup (Expo + TypeScript + Firebase)
- Navigation structure (all stacks + tabs)
- Auth flow (OTP login, session management)
- Brand tokens, reusable components (Button, Card, Badge, Input, BottomSheet)

### Phase 2 — Customer App (Week 3–4)
- Products list + detail + search/filter
- Cart + Checkout (date picker + holidays)
- Orders list + detail
- Profile + Wallet

### Phase 3 — Admin App (Week 5–7)
- Dashboard (KPIs, pipeline tabs, low stock, expiry alerts)
- Orders list + detail + status flow
- Products CRUD + stock receive
- Customers + Suppliers + Purchase Orders

### Phase 4 — B2B + Polish (Week 8–9)
- Full B2B portal
- Push notifications (FCM)
- Offline caching
- Deep linking

### Phase 5 — QA + Release (Week 10)
- Device testing (iOS + Android)
- EAS Build + App Store / Play Store submission
- OTA update config

---

## 13. Key Mobile UX Decisions

| Web Pattern | Mobile Adaptation |
|---|---|
| Drag-and-drop Kanban | Swipeable tab columns + long-press status sheet |
| ⌘K command palette | Search icon → full-screen modal |
| Hover states | Tap + ripple (Android) / highlight (iOS) |
| Wide data tables | Horizontal scroll or card-based rows |
| Sticky headers | `FlatList` `stickyHeaderIndices` or native sticky nav bar |
| Modal dialogs | Bottom sheets (`@gorhom/bottom-sheet`) |
| Date input | Native `DateTimePicker` with holiday blocking logic |
| CSV import | File picker (`expo-document-picker`) |
| PDF generation | `expo-print` + share sheet |
| Barcode display | `react-native-barcode-svg` |
| Image upload | `expo-image-picker` (camera + gallery) |

---

*Spec prepared from codebase analysis of `di-peppi-firebase/di-peppi-ui` — April 30, 2026*
