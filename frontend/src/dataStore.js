import { apiFetch } from "./apiConfig";

/**
 * One uniform async data interface with two interchangeable implementations:
 *
 *   list()                     -> array of extraction rows
 *   create(extractionResult)   -> the stored row
 *   update(id, field, value)   -> the updated row
 *   remove(id)                 -> void
 *
 * Signed-in users read/write the backend; signed-out guests get localStorage.
 * Keeping both behind the same shape means callers never branch on auth state.
 */

// Distinct from AuthContext's "pdfx_guest_mode" flag, which stores something else
// entirely (whether the visitor chose to skip signing in).
const GUEST_KEY = "pdfx_guest_extractions";

// Set once the user has declined to import their guest rows, so the offer is not
// re-presented on every page load. Separate from GUEST_KEY: the rows themselves
// stay put, since declining is not the same as discarding.
const IMPORT_DECLINED_KEY = "pdfx_guest_import_declined";

// Must not exceed the server's MAX_IMPORT_ITEMS (200); larger lists are chunked.
const IMPORT_CHUNK_SIZE = 200;

// Whitelist of what a guest row may contain. Anything the backend adds later --
// pdf_base64 above all -- is dropped instead of silently eating the ~5MB
// localStorage quota (base64 inflates a PDF by a third, so one file could fill it).
const GUEST_FIELDS = [
  "filename",
  "title",
  "authors",
  "year",
  "doi",
  "url",
  "abstract",
  "conclusion",
];

const apiStore = {
  async list() {
    const res = await apiFetch("/api/extractions");
    if (!res.ok) throw new Error(`Failed to load files (${res.status})`);
    return res.json();
  },

  // POST /api/extract already persisted the row server-side, so there is nothing
  // left to write here -- just hand it back so both stores behave alike.
  async create(extractionResult) {
    return extractionResult;
  },

  async update(id, field, value) {
    const res = await apiFetch(`/api/extractions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error(`Update failed (${res.status})`);
    return res.json();
  },

  async remove(id) {
    const res = await apiFetch(`/api/extractions/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  },

  /**
   * Adopt guest rows into the signed-in account.
   *
   * The endpoint takes a bare JSON array and caps each request at
   * IMPORT_CHUNK_SIZE items, so send it in chunks rather than assuming the
   * caller's list is small. Guest rows carry a string `id` that the server
   * ignores; the returned rows have real integer ids.
   */
  async importMany(rows) {
    const imported = [];
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE);
      const res = await apiFetch("/api/extractions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Import failed (${res.status})`);
      }
      imported.push(...(await res.json()));
    }
    return imported;
  },
};

// Disambiguates ids minted inside the same millisecond, which Date.now() alone
// cannot do -- two quick uploads would otherwise collide.
let idSeq = 0;

function newGuestId() {
  // randomUUID is missing on older Safari and on any non-secure origin, so it
  // can only ever be an optimisation, never the only path.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `guest-${crypto.randomUUID()}`;
  }
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `guest-${Date.now().toString(36)}-${idSeq}-${rand}`;
}

function readGuestRows() {
  let raw;
  try {
    raw = localStorage.getItem(GUEST_KEY);
  } catch {
    // Safari private mode can throw on plain reads too.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt payload: recover to an empty list rather than throwing into render.
    console.error("Discarding unreadable guest extractions in localStorage.");
    return [];
  }
}

function writeGuestRows(rows) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(rows));
  } catch {
    // QuotaExceededError, or Safari private mode where any write throws. Re-throw
    // something a caller can put in front of the user.
    throw new Error(
      "Could not save to this browser's storage. It may be full or unavailable " +
        "-- sign in to store documents in your account."
    );
  }
}

const localStore = {
  async list() {
    return readGuestRows();
  },

  async create(extractionResult) {
    const row = { id: newGuestId() };
    for (const field of GUEST_FIELDS) {
      if (field in extractionResult) row[field] = extractionResult[field];
    }
    writeGuestRows([...readGuestRows(), row]);
    return row;
  },

  async update(id, field, value) {
    const rows = readGuestRows();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error("That document is no longer stored here.");
    const updated = { ...rows[index], [field]: value };
    rows[index] = updated;
    writeGuestRows(rows);
    return updated;
  },

  async remove(id) {
    writeGuestRows(readGuestRows().filter((row) => row.id !== id));
  },

  // Used after a successful import, once the rows live in the account instead.
  clear() {
    try {
      localStorage.removeItem(GUEST_KEY);
      localStorage.removeItem(IMPORT_DECLINED_KEY);
    } catch {
      // Nothing useful to do -- the rows have already been imported server-side,
      // so a failure to tidy up locally must not surface as an error.
    }
  },
};

export function getStore(isAuthenticated) {
  return isAuthenticated ? apiStore : localStore;
}

// --- guest -> account adoption ------------------------------------------------

/** Guest rows still sitting in this browser, or [] if there are none. */
export function getPendingGuestRows() {
  return readGuestRows();
}

export function hasDeclinedImport() {
  try {
    return localStorage.getItem(IMPORT_DECLINED_KEY) === "true";
  } catch {
    return false;
  }
}

export function declineImport() {
  try {
    localStorage.setItem(IMPORT_DECLINED_KEY, "true");
  } catch {
    // If we cannot remember the refusal the offer reappears next load, which is
    // mildly annoying but harmless -- never worth breaking the UI over.
  }
}

export { GUEST_KEY, IMPORT_DECLINED_KEY, apiStore, localStore };
