// SSR-safe service-worker registration. No-ops on the server, in browsers
// without service-worker support, and outside production builds. Never throws.

/**
 * Register the app-shell service worker when it is safe and useful to do so.
 * Returns a promise that resolves to true if registration was attempted.
 */
export function registerServiceWorker(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    process.env.NODE_ENV !== "production"
  ) {
    return Promise.resolve(false);
  }
  return navigator.serviceWorker
    .register("/sw.js")
    .then(() => true)
    .catch(() => false);
}
