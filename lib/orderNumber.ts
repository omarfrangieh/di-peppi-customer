import { db } from "@/lib/firebase";
import { doc, runTransaction } from "firebase/firestore";

/**
 * Generates the next sequential order number using a Firestore atomic counter.
 * Format: ORD-YYYY-NNNN (e.g. ORD-2026-0001)
 * Thread-safe — uses a Firestore transaction so no two orders ever share a number.
 */
export async function generateOrderNumber(): Promise<string> {
  const counterRef = doc(db, "settings", "counters");
  const year = new Date().getFullYear();

  const nextNum = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const data = snap.exists() ? snap.data() : {};

    // Reset counter each year
    const storedYear = data.orderYear ?? year;
    const current = storedYear === year ? (data.orderCounter ?? 0) : 0;
    const next = current + 1;

    tx.set(
      counterRef,
      { orderCounter: next, orderYear: year },
      { merge: true }
    );

    return next;
  });

  return `ORD-${year}-${String(nextNum).padStart(4, "0")}`;
}
