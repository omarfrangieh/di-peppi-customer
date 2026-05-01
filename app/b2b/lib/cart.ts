import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface B2BCartItem {
  productId: string;
  productName: string;
  quantity: number;
  priceAtTime: number; // wholesale/B2B price locked when added
  unit: string;
  caseSize?: number; // units per case, if applicable
}

export interface B2BCartStore {
  items: B2BCartItem[];
  addItem: (item: B2BCartItem) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, quantity: number) => void;
  clear: () => void;
  getSubtotal: () => number;
  getTotal: () => number;
}

const useB2BCart = create<B2BCartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item: B2BCartItem) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },

      updateQty: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        }));
      },

      clear: () => set({ items: [] }),

      getSubtotal: () =>
        get().items.reduce((sum, item) => sum + item.priceAtTime * item.quantity, 0),

      getTotal: () => get().getSubtotal(),
    }),
    {
      name: 'di-peppi-b2b-cart',
      version: 1,
    }
  )
);

export default useB2BCart;
