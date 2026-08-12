export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
