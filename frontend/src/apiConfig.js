// In production, requests go to a relative /api path on the frontend's own
// origin, which vercel.json rewrites (proxies) through to the API deployment.
// That makes the session cookie same-site instead of cross-site, which matters
// because Safari's ITP (and Chrome's phase-out of third-party cookies) blocks a
// cookie set by a cross-site fetch response -- sign-in would appear to work
// (the response body still comes back) but the cookie itself would never be
// stored, so the next request would look like a guest. Local dev still talks
// directly to the backend dev server, which is a same-site port difference and
// unaffected by this.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000" : "");

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/**
 * fetch wrapper for our API.
 *
 * credentials: "include" is required on every call -- the session lives in an
 * httpOnly cookie, and cross-origin fetches drop cookies unless asked not to.
 */
export function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });
}
