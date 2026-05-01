/**
 * Global toast utility — works without React context.
 * Dispatches a custom DOM event picked up by <ToastContainer />.
 */
export type ToastType = "success" | "error" | "info" | "warning";

export function showToast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("di-peppi-toast", { detail: { message, type } })
  );
}
